/**
 * T08 카드 2 — WebAuthn 등록. 등록 challenge는 5분만 유효하고 1회용이다.
 * 의도적으로 로그인용 assertion/세션 발급은 다음 카드까지 비활성 상태로 둔다.
 * 최초 등록: 닉네임 신규 생성 + 패스키; 추가 등록: 기존 유효한 서버 세션 필수.
 */
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';

const MAX_JSON_SIZE = 70000;
const CHALLENGE_LIFETIME_SEC = 300;
const respHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
};
const result = (payload, status = 200) => new Response(JSON.stringify(payload), {status, headers: respHeaders});
const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function digestHex(text) {
  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hashed), c => c.toString(16).padStart(2, '0')).join('');
}

function errorBody(error, status = 400) { return result({ error }, status); }
function normalizeNickname(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return /^[가-힣a-zA-Z0-9_-]{2,24}$/u.test(trimmed) ? trimmed : null;
}
function normalizeLabel(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length >= 2 && trimmed.length <= 40 && !/[\u0000-\u001F\u007F<>]/.test(trimmed)
    ? trimmed : null;
}
async function readJSON(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return null;
  if (Number(request.headers.get('Content-Length') || 0) > MAX_JSON_SIZE) return null;
  const text = await request.text();
  if (text.length > MAX_JSON_SIZE) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
function originFor(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return null;
  return url.origin;
}
function isSameOriginWrite(request) {
  const expectedOrigin = originFor(request);
  return expectedOrigin && request.headers.get('Origin') === expectedOrigin;
}
function blobBytes(key) { return Array.from(key); }
async function runOptions(request, env, getSessionUser) {
  const data = await readJSON(request);
  if (!data) return errorBody('invalid_json');
  const label = normalizeLabel(data.label);
  if (!label) return errorBody('invalid_label');
  const sessionUserId = await getSessionUser(request, env);
  let nickname, userId, registered = [];
  if (sessionUserId) {
    const user = await env.DB.prepare('SELECT id, nickname FROM users WHERE id = ? LIMIT 1').bind(sessionUserId).first();
    if (!user) return errorBody('session_invalid', 401);
    nickname = user.nickname;
    userId = user.id;
    const query = await env.DB.prepare('SELECT credential_id, transports FROM passkeys WHERE user_id = ?').bind(userId).all();
    registered = query.results ?? [];
  } else {
    nickname = normalizeNickname(data.nickname);
    if (!nickname) return errorBody('invalid_nickname');
    const exists = await env.DB.prepare('SELECT id FROM users WHERE nickname = ? LIMIT 1').bind(nickname).first();
    if (exists) return errorBody('nickname_taken', 409);
    userId = crypto.randomUUID();
  }

  const origin = originFor(request);
  const options = await generateRegistrationOptions({
    rpName: 'T08 MY SPACE',
    rpID: new URL(origin).hostname,
    userID: new TextEncoder().encode(userId),
    userName: nickname,
    userDisplayName: nickname,
    attestationType: 'none',
    timeout: 60000,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: registered.map(item => ({
      id: item.credential_id,
      transports: item.transports ? JSON.parse(item.transports) : undefined,
    })),
    // Common authenticator algorithms with wide platform support.
    supportedAlgorithmIDs: [-7, -257],
  });

  const transactionId = crypto.randomUUID();
  const issued = nowSeconds();
  await env.DB.prepare('DELETE FROM challenges WHERE expires_at <= ?').bind(issued).run();
  await env.DB.prepare(`INSERT INTO challenges
    (id, user_id, purpose, challenge_hash, expires_at, consumed_at,
     pending_nickname, pending_label, pending_user_id, rp_origin)
     VALUES (?, ?, 'register', ?, ?, NULL, ?, ?, ?, ?)`)
    .bind(transactionId, sessionUserId || null, await digestHex(options.challenge),
      issued + CHALLENGE_LIFETIME_SEC, nickname, label, userId, origin).run();

  return result({transactionId, options, expiresInSeconds: CHALLENGE_LIFETIME_SEC});
}

async function runVerify(request, env, getSessionUser) {
  const data = await readJSON(request);
  if (!data || !/^[a-f0-9-]{36}$/i.test(data.transactionId || '') || !data.credential || typeof data.credential !== 'object') {
    return errorBody('invalid_request');
  }
  const pending = await env.DB.prepare(`SELECT id, user_id, challenge_hash, expires_at, consumed_at,
    pending_nickname, pending_label, pending_user_id, rp_origin
    FROM challenges WHERE id = ? AND purpose = 'register' LIMIT 1`).bind(data.transactionId).first();
  if (!pending) return errorBody('challenge_not_found', 404);
  if (pending.consumed_at !== null || pending.expires_at <= nowSeconds()) return errorBody('challenge_expired_or_used', 409);
  if (!pending.rp_origin || pending.rp_origin !== originFor(request)) return errorBody('origin_mismatch', 403);

  const sessionUserId = await getSessionUser(request, env);
  if (pending.user_id && (!sessionUserId || pending.user_id !== sessionUserId)) return errorBody('login_required', 401);
  if (!pending.user_id && sessionUserId) return errorBody('registration_context_changed', 409);

  let registration;
  try {
    registration = await verifyRegistrationResponse({
      response: data.credential,
      expectedChallenge: async challenge => await digestHex(challenge) === pending.challenge_hash,
      expectedOrigin: pending.rp_origin,
      expectedRPID: new URL(pending.rp_origin).hostname,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
  } catch {
    // Never return raw attestation or crypto verification errors to clients.
    return errorBody('registration_verification_failed', 400);
  }
  if (!registration.verified || !registration.registrationInfo) return errorBody('registration_verification_failed');

  const { credential } = registration.registrationInfo;
  if (!credential?.id || !(credential.publicKey instanceof Uint8Array)) return errorBody('invalid_credential');

  // Consume with one atomic compare-and-set. Parallel verification requests cannot both succeed.
  const consumed = await env.DB.prepare(`UPDATE challenges SET consumed_at = ?
    WHERE id = ? AND purpose = 'register' AND consumed_at IS NULL AND expires_at > ?`)
    .bind(nowSeconds(), pending.id, nowSeconds()).run();
  if (consumed.meta?.changes !== 1) return errorBody('challenge_expired_or_used', 409);

  const issued = nowSeconds();
  const statements = [];
  if (!pending.user_id) {
    statements.push(env.DB.prepare('INSERT INTO users (id, nickname, created_at) VALUES (?, ?, ?)')
      .bind(pending.pending_user_id, pending.pending_nickname, issued));
  }
  statements.push(env.DB.prepare(`INSERT INTO passkeys
    (credential_id, user_id, label, public_key, counter, transports, registered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(credential.id, pending.pending_user_id, pending.pending_label,
      blobBytes(credential.publicKey), credential.counter,
      JSON.stringify(credential.transports ?? []), issued));
  try {
    await env.DB.batch(statements);
  } catch {
    // Challenge remains consumed; caller must retry with new options. No partial user/passkey writes (D1.batch transaction).
    return errorBody('registration_conflict_retry', 409);
  }
  return result({ verified: true, nickname: pending.pending_nickname, label: pending.pending_label,
    credentialIdHint: `${credential.id.slice(0, 6)}…`, registeredAt: new Date(issued * 1000).toISOString(),
    // Diagnostic only: no private key or full credential ID in JSON response.
    stored: 'public_key' });
}

async function runCancel(request, env, getSessionUser) {
  const data = await readJSON(request);
  if (!data || !/^[a-f0-9-]{36}$/i.test(data.transactionId || '')) return errorBody('invalid_request');
  const sessionUserId = await getSessionUser(request, env);
  const pending = await env.DB.prepare("SELECT user_id FROM challenges WHERE id = ? AND purpose = 'register' LIMIT 1")
    .bind(data.transactionId).first();
  if (!pending) return result({ cancelled: true });
  if (pending.user_id && pending.user_id !== sessionUserId) return errorBody('login_required', 401);
  await env.DB.prepare("DELETE FROM challenges WHERE id = ? AND purpose = 'register' AND consumed_at IS NULL")
    .bind(data.transactionId).run();
  return result({ cancelled: true });
}

/** Return response for recognized registration route; null for others. */
export async function handleRegistration(request, env, getSessionUser) {
  const path = new URL(request.url).pathname;
  const endpoints = {
    '/api/passkeys/register/options': runOptions,
    '/api/passkeys/register/verify': runVerify,
    '/api/passkeys/register/cancel': runCancel,
  };
  const action = endpoints[path];
  if (!action) return null;
  if (request.method !== 'POST') return errorBody('method_not_allowed', 405);
  if (!isSameOriginWrite(request)) return errorBody('invalid_origin', 403);
  if (!env.DB) return errorBody('db_unavailable', 503);
  try { return await action(request, env, getSessionUser); }
  catch { return errorBody('registration_service_unavailable', 503); }
}
