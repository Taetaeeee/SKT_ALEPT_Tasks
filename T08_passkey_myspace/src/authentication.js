/**
 * T08 카드 3 — 패스키 로그인/로그아웃.
 * 익명 로그인 옵션 발급 → 서버에 challenge SHA-256 저장 → assertion 서명 검증
 * → challenge 일회용 소비 → 난수 세션 해시 저장 (쿠키에는 난수만 전송).
 * 인증된 사용자 ID는 요청 파라미터가 아니라 검증된 Credential ID로 결정한다.
 */
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { digestHex } from './registration.js';

const CHALLENGE_TTL = 300;
const SESSION_TTL = 12 * 60 * 60;
const MAX_JSON = 70000;
export const SESSION_COOKIE = 't08_session';
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
};
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...HEADERS, ...extraHeaders } });
const error = (code, status = 400) => json({ error: code }, status);

function expectedOrigin(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null;
  return url.origin;
}
function sameOrigin(request) {
  const origin = expectedOrigin(request);
  return !!origin && request.headers.get('Origin') === origin;
}
async function bodyAsJSON(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return null;
  if (Number(request.headers.get('Content-Length') || 0) > MAX_JSON) return null;
  const text = await request.text();
  if (text.length > MAX_JSON) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function cookieIn(request) {
  const text = request.headers.get('Cookie') || '';
  for (const part of text.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === SESSION_COOKIE) return value.join('=');
  }
  return null;
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // 32 random bytes => 43-character base64url string.
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
function tokenCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`;
}

// Cookie hash matches src/index.js. No session plaintext is stored in D1 or logged.
async function loginOptions(request, env) {
  const origin = expectedOrigin(request);
  if (!origin) return error('https_required', 400);
  const opts = await generateAuthenticationOptions({
    rpID: new URL(origin).hostname,
    timeout: 60000,
    userVerification: 'required',
    // Omit allowCredentials to support discoverable credentials and Bitwarden.
  });
  const transactionId = crypto.randomUUID();
  const issued = now();
  await env.DB.prepare('DELETE FROM challenges WHERE expires_at <= ?').bind(issued).run();
  await env.DB.prepare(`INSERT INTO challenges
    (id, user_id, purpose, challenge_hash, expires_at, consumed_at, rp_origin)
    VALUES (?, NULL, 'authenticate', ?, ?, NULL, ?)`).bind(
    transactionId, await digestHex(opts.challenge), issued + CHALLENGE_TTL, origin,
  ).run();
  return json({ transactionId, options: opts, expiresInSeconds: CHALLENGE_TTL });
}

/** D1 returns BLOB columns as an array; normalize for SimpleWebAuthn. */
export function keyAsBytes(blob) {
  if (blob instanceof Uint8Array) return blob;
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
  if (Array.isArray(blob) && blob.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return new Uint8Array(blob);
  }
  throw new Error('invalid_stored_public_key');
}

async function loginVerify(request, env) {
  const input = await bodyAsJSON(request);
  if (!input || !/^[a-f0-9-]{36}$/i.test(input.transactionId || '') ||
      !input.credential || typeof input.credential !== 'object' ||
      typeof input.credential.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,1024}$/.test(input.credential.id) ||
      input.credential.type !== 'public-key') return error('invalid_request');

  const challenge = await env.DB.prepare(`SELECT id, challenge_hash, consumed_at, expires_at, rp_origin
    FROM challenges WHERE id = ? AND purpose = 'authenticate' LIMIT 1`)
    .bind(input.transactionId).first();
  if (!challenge) return error('challenge_not_found', 404);
  if (challenge.consumed_at !== null || challenge.expires_at <= now()) return error('challenge_expired_or_used', 409);
  if (!challenge.rp_origin || challenge.rp_origin !== expectedOrigin(request)) return error('origin_mismatch', 403);

  // Consume the challenge BEFORE signature verification. A failed assertion also burns it.
  // The database atomic comparison prevents simultaneous requests from replaying the same challenge.
  const claimAt = now();
  const claimed = await env.DB.prepare(`UPDATE challenges SET consumed_at = ?
    WHERE id = ? AND purpose = 'authenticate' AND consumed_at IS NULL AND expires_at > ?`)
    .bind(claimAt, challenge.id, claimAt).run();
  if (claimed.meta?.changes !== 1) return error('challenge_expired_or_used', 409);

  const passkey = await env.DB.prepare(`SELECT credential_id, user_id, public_key, counter, transports
    FROM passkeys WHERE credential_id = ? LIMIT 1`).bind(input.credential.id).first();
  if (!passkey) return error('authentication_failed', 401);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.credential,
      expectedChallenge: async value => (await digestHex(value)) === challenge.challenge_hash,
      expectedOrigin: challenge.rp_origin,
      expectedRPID: new URL(challenge.rp_origin).hostname,
      credential: {
        id: passkey.credential_id,
        publicKey: keyAsBytes(passkey.public_key),
        counter: passkey.counter,
        transports: passkey.transports ? JSON.parse(passkey.transports) : [],
      },
      requireUserVerification: true,
    });
  } catch {
    return error('authentication_failed', 401); // Never expose signature details.
  }
  if (!verification.verified || !verification.authenticationInfo) return error('authentication_failed', 401);

  const latestCounter = verification.authenticationInfo.newCounter;
  if (!Number.isSafeInteger(latestCounter) || latestCounter < 0) return error('authentication_failed', 401);
  const user = await env.DB.prepare('SELECT nickname FROM users WHERE id = ? LIMIT 1').bind(passkey.user_id).first();
  if (!user) return error('authentication_failed', 401);

  const sessionToken = randomToken();
  const sessionHash = await digestHex(sessionToken);
  const issued = now();
  // Keep counter update + session issuance together; no cookie until both DB writes succeed.
  // A strictly incrementing counter guards authenticators that support counters.
  const writes = await env.DB.batch([
    env.DB.prepare(`UPDATE passkeys SET counter = ? WHERE credential_id = ? AND user_id = ?
      AND (counter = 0 OR counter < ?)`).bind(latestCounter, passkey.credential_id, passkey.user_id, latestCounter),
    env.DB.prepare(`INSERT INTO sessions (session_hash, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)`).bind(sessionHash, passkey.user_id, issued, issued + SESSION_TTL),
  ]);
  // Batch is transactional but update can affect 0 rows on concurrent counter change.
  // If this occurred, explicitly revoke the newly created session.
  if (writes[0]?.meta?.changes !== 1) {
    await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(sessionHash).run();
    return error('authentication_failed', 401);
  }
  return json({ authenticated: true, nickname: user.nickname, expiresInSeconds: SESSION_TTL },
    200, { 'Set-Cookie': tokenCookie(sessionToken) });
}

async function logout(request, env) {
  const token = cookieIn(request);
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(await digestHex(token)).run();
  }
  return json({ authenticated: false, loggedOut: true }, 200, { 'Set-Cookie': clearCookie() });
}

/** Return response for recognized authentication route, or null. */
export async function handleAuthentication(request, env) {
  const route = new URL(request.url).pathname;
  const endpoints = {
    '/api/passkeys/login/options': loginOptions,
    '/api/passkeys/login/verify': loginVerify,
    '/api/auth/logout': logout,
  };
  const handler = endpoints[route];
  if (!handler) return null;
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  if (!sameOrigin(request)) return error('invalid_origin', 403);
  if (!env.DB) return error('db_unavailable', 503);
  try { return await handler(request, env); }
  catch { return error('authentication_service_unavailable', 503); }
}
