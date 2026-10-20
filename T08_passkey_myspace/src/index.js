/**
 * T08 card 1: public static assets + fail-closed private API.
 * This stage deliberately has NO passkey enrollment or session issuance endpoint.
 * Only WebAuthn verification (added in card 2-3) may create valid sessions later.
 */
const PRIVATE_COOKIE = 't08_session';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cookieValue(request, name) {
  const raw = request.headers.get('Cookie') ?? '';
  for (const section of raw.split(';')) {
    const [key, ...value] = section.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

async function sha256Base64Url(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

/** Fail closed: user is derived from a valid unexpired server session, never URL/body. */
async function verifiedUserId(request, env) {
  const rawToken = cookieValue(request, PRIVATE_COOKIE);
  // Expected random 32-byte base64url cookie in the later WebAuthn stage.
  if (!rawToken || !/^[A-Za-z0-9_-]{43}$/.test(rawToken) || !env.DB) return null;
  const tokenHash = await sha256Base64Url(rawToken);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    'SELECT user_id FROM sessions WHERE session_hash = ? AND expires_at > ? LIMIT 1'
  ).bind(tokenHash, now).first();
  return session?.user_id || null;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (pathname === '/api/auth/status') {
      if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
      try {
        const userId = await verifiedUserId(request, env);
        return reply({ authenticated: Boolean(userId) });
      } catch {
        return reply({ error: 'service_unavailable' }, 503);
      }
    }

    if (pathname === '/api/private/items' || pathname.startsWith('/api/private/items/')) {
      if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
      let userId;
      try {
        userId = await verifiedUserId(request, env);
      } catch {
        return reply({ error: 'service_unavailable' }, 503);
      }
      if (!userId) return reply({ error: 'unauthorized', message: '패스키 인증이 필요합니다.' }, 401);
      if (!env.DB) return reply({ error: 'service_unavailable' }, 503);
      try {
        if (pathname === '/api/private/items') {
          // No user ID parameter. Ownership is always derived from the session.
          const result = await env.DB.prepare(
            'SELECT id, title, body, created_at FROM private_items WHERE owner_id = ? ORDER BY created_at DESC, id DESC'
          ).bind(userId).all();
          return reply({ items: result.results ?? [] });
        }
        const itemId = pathname.slice('/api/private/items/'.length);
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(itemId)) return reply({ error: 'not_found' }, 404);
        const item = await env.DB.prepare(
          'SELECT id, title, body, created_at FROM private_items WHERE owner_id = ? AND id = ? LIMIT 1'
        ).bind(userId, itemId).first();
        return item ? reply({ item }) : reply({ error: 'not_found' }, 404);
      } catch {
        return reply({ error: 'service_unavailable' }, 503);
      }
    }

    // Reserve all unknown /api routes. No placeholder auth endpoint grants access.
    return reply({ error: 'not_found' }, 404);
  },
};
