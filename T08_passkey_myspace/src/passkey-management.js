/**
 * T08 card 4: list and revoke passkeys for the authenticated account only.
 * No public key / authenticator secrets are sent to the browser in the list.
 * Delete operations use an atomic last-passkey guard and revoke all sessions.
 */

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
};
const MAX_JSON_BYTES = 2048;
const RECENT_LOGIN_SECONDS = 600;
const COOKIE = 't08_session';
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const error = (code, status) => json({ error: code }, status);
const now = () => Math.floor(Date.now() / 1000);
async function digestHex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function sessionToken(request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) {
      const token = rest.join('=');
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
    }
  }
  return null;
}

async function credentialList(env, userId) {
  const { results = [] } = await env.DB.prepare(
    'SELECT credential_id, label, registered_at FROM passkeys WHERE user_id = ? ORDER BY registered_at DESC, credential_id ASC'
  ).bind(userId).all();
  return results.map(row => ({
    credentialId: row.credential_id,
    label: row.label,
    registeredAt: row.registered_at,
  }));
}

async function readJSON(request) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return null;
  if (Number(request.headers.get('Content-Length') || 0) > MAX_JSON_BYTES) return null;
  const input = await request.text();
  if (input.length > MAX_JSON_BYTES) return null;
  try {
    const data = JSON.parse(input);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch { return null; }
}

async function revokeOne(request, env, userId) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return error('invalid_origin', 403);
  const data = await readJSON(request);
  if (!data || typeof data.credentialId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,1024}$/.test(data.credentialId)) return error('invalid_request', 400);

  // Require a newly authenticated session for account-recovery-sensitive changes.
  // The user can simply sign in again with a registered passkey if this has expired.
  const token = sessionToken(request);
  if (!token) return error('login_required', 401);
  const issued = await env.DB.prepare(
    'SELECT created_at FROM sessions WHERE session_hash = ? AND user_id = ? AND expires_at > ? LIMIT 1'
  ).bind(await digestHex(token), userId, now()).first();
  if (!issued) return error('login_required', 401);
  if (now() - issued.created_at > RECENT_LOGIN_SECONDS) return error('recent_login_required', 403);

  // A *single SQLite statement* checks ownership and ensures at least one remains.
  // Unlike a read-count-then-delete sequence, two deletion attempts cannot both
  // pass a stale count check and leave the user with zero credentials.
  const deletion = await env.DB.prepare(`DELETE FROM passkeys
    WHERE credential_id = ? AND user_id = ?
      AND (SELECT COUNT(*) FROM passkeys WHERE user_id = ?) > 1`)
    .bind(data.credentialId, userId, userId).run();

  if (deletion.meta?.changes !== 1) {
    const owned = await env.DB.prepare(
      'SELECT 1 AS found FROM passkeys WHERE credential_id = ? AND user_id = ? LIMIT 1'
    ).bind(data.credentialId, userId).first();
    if (!owned) return error('passkey_not_found', 404); // also covers someone else's credential
    return error('last_passkey_protected', 409);
  }

  // Any pre-existing session could have originated from the removed passkey.
  // Invalidate every session so deleted credentials do not retain a live session.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  const remaining = await credentialList(env, userId);
  return json({ deleted: true, remainingCount: remaining.length, loggedOut: true }, 200, {
    'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  });
}

/** Return a response for the passkey management routes, or null for other routes. */
export async function handlePasskeyManagement(request, env, verifiedUserId) {
  const path = new URL(request.url).pathname;
  if (path !== '/api/passkeys/manage' && path !== '/api/passkeys/manage/delete') return null;
  if (path === '/api/passkeys/manage' && request.method !== 'GET') return error('method_not_allowed', 405);
  if (path === '/api/passkeys/manage/delete' && request.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.DB) return error('db_unavailable', 503);
  try {
    const userId = await verifiedUserId(request, env);
    if (!userId) return error('unauthorized', 401);
    if (path === '/api/passkeys/manage') {
      const passkeys = await credentialList(env, userId);
      return json({ passkeys, count: passkeys.length, lastPasskeyDeletionBlocked: true });
    }
    return await revokeOne(request, env, userId);
  } catch {
    // DB failure: do not advertise successful deletion or expose session details.
    return error('passkey_management_unavailable', 503);
  }
}
