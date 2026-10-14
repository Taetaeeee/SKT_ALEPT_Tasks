const SESSION_COOKIE = 'pds_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const PBKDF2_ITERATIONS = 100000;
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function badRequest(message, details = undefined) {
  return json({ ok: false, error: 'BAD_REQUEST', message, details }, 400);
}

function unauthorized(message = '로그인이 필요합니다.') {
  return json({ ok: false, error: 'UNAUTHORIZED', message }, 401);
}

function forbidden(message = '요청을 처리할 수 없습니다.') {
  return json({ ok: false, error: 'FORBIDDEN', message }, 403);
}

function notFound(message = '찾을 수 없습니다.') {
  return json({ ok: false, error: 'NOT_FOUND', message }, 404);
}

function conflict(code, message) {
  return json({ ok: false, error: code, message }, 409);
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function seoulToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateUsername(username) {
  return /^[a-z0-9._-]{4,40}$/.test(username);
}

function validatePassword(password) {
  if (typeof password !== 'string') return false;
  const bytes = new TextEncoder().encode(password).byteLength;
  return password.length >= 8 && password.length <= 128 && bytes <= 256;
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

async function derivePassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derivePassword(password, salt);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(derived)}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, iterationText, saltText, expectedText] = String(stored || '').split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || !saltText || !expectedText) return false;
  const actual = await derivePassword(password, decodeBase64Url(saltText), iterations);
  const expected = decodeBase64Url(expectedText);
  if (actual.length !== expected.length) return false;
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(actual, expected);
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookieHeader(request, token, maxAge = SESSION_TTL_SECONDS) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearCookieHeader(request) {
  return cookieHeader(request, '', 0);
}

function assertSameOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('JSON_REQUIRED');
  return request.json();
}

async function createSession(env, request, userId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)
  `).bind(userId, tokenHash, expiresAt).run();
  return { token, expiresAt, setCookie: cookieHeader(request, token) };
}

async function getAuth(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT u.id AS user_id, u.username, u.auth_version, s.id AS session_id, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, now).first();
  return row || null;
}

async function requireAuth(request, env) {
  return getAuth(request, env);
}

async function register(request, env) {
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const username = normalizeUsername(input.username);
  const password = input.password;
  if (!validateUsername(username)) {
    return badRequest('아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 4~40자여야 합니다.');
  }
  if (!validatePassword(password)) {
    return badRequest('비밀번호는 8~128자이며 UTF-8 256바이트 이하여야 합니다.');
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (existing) return conflict('USERNAME_TAKEN', '이미 사용 중인 아이디입니다.');

  const countBefore = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  const passwordHash = await hashPassword(password);
  let result;
  try {
    result = await env.DB.prepare(`
      INSERT INTO users (username, password_hash) VALUES (?, ?)
    `).bind(username, passwordHash).run();
  } catch {
    return conflict('USERNAME_TAKEN', '이미 사용 중인 아이디입니다.');
  }

  const userId = Number(result.meta.last_row_id);
  let claimedLegacyPlans = 0;
  if (Number(countBefore?.count || 0) === 0) {
    const claim = await env.DB.prepare('UPDATE plans SET user_id = ? WHERE user_id IS NULL').bind(userId).run();
    claimedLegacyPlans = Number(claim.meta?.changes || 0);
  }

  const session = await createSession(env, request, userId);
  return json({
    ok: true,
    user: { id: userId, username },
    session_expires_at: session.expiresAt,
    claimed_legacy_plans: claimedLegacyPlans
  }, 201, { 'set-cookie': session.setCookie });
}

async function login(request, env) {
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const username = normalizeUsername(input.username);
  const password = typeof input.password === 'string' ? input.password : '';
  const genericMessage = '아이디 또는 비밀번호를 확인해 주세요.';

  const user = validateUsername(username)
    ? await env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first()
    : null;

  let matched = false;
  if (user && validatePassword(password)) {
    matched = await verifyPassword(password, user.password_hash);
  } else if (password) {
    // 사용자 존재 여부에 따른 처리 시간 차이를 줄이기 위한 더미 PBKDF2 연산.
    await derivePassword(password.slice(0, 128), new Uint8Array(16));
  }

  if (!user || !matched) return json({ ok: false, error: 'LOGIN_FAILED', message: genericMessage }, 401);

  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
  const session = await createSession(env, request, Number(user.id));
  return json({
    ok: true,
    user: { id: Number(user.id), username: user.username },
    session_expires_at: session.expiresAt
  }, 200, { 'set-cookie': session.setCookie });
}

async function logout(request, env, auth) {
  if (auth?.session_id) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').bind(auth.session_id, auth.user_id).run();
  }
  return json({ ok: true }, 200, { 'set-cookie': clearCookieHeader(request) });
}

async function changePassword(request, env, auth) {
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const current = typeof input.current_password === 'string' ? input.current_password : '';
  const next = typeof input.new_password === 'string' ? input.new_password : '';
  if (!validatePassword(next)) return badRequest('새 비밀번호는 8~128자이며 UTF-8 256바이트 이하여야 합니다.');

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user_id).first();
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    return json({ ok: false, error: 'PASSWORD_CHANGE_FAILED', message: '현재 비밀번호를 확인해 주세요.' }, 401);
  }
  const nextHash = await hashPassword(next);
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_hash = ?, auth_version = auth_version + 1,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(nextHash, auth.user_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(auth.user_id)
  ]);
  const session = await createSession(env, request, auth.user_id);
  return json({ ok: true, session_expires_at: session.expiresAt }, 200, { 'set-cookie': session.setCookie });
}

async function deleteAccount(request, env, auth) {
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  if (input.confirm !== 'DELETE') return badRequest('계정 삭제 확인값으로 DELETE를 입력해 주세요.');

  const uid = auth.user_id;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM plan_rule_changes WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM usage_daily_records WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM usage_study_config WHERE user_id = ?').bind(uid),
    env.DB.prepare(`DELETE FROM carryovers WHERE source_plan_id IN (SELECT id FROM plans WHERE user_id = ?)
      OR target_plan_id IN (SELECT id FROM plans WHERE user_id = ?)`).bind(uid, uid),
    env.DB.prepare('DELETE FROM reflections WHERE plan_id IN (SELECT id FROM plans WHERE user_id = ?)').bind(uid),
    env.DB.prepare(`DELETE FROM completion_events WHERE task_id IN (
      SELECT t.id FROM tasks t JOIN plans p ON p.id = t.plan_id WHERE p.user_id = ?
    )`).bind(uid),
    env.DB.prepare(`DELETE FROM execution_logs WHERE task_id IN (
      SELECT t.id FROM tasks t JOIN plans p ON p.id = t.plan_id WHERE p.user_id = ?
    )`).bind(uid),
    env.DB.prepare('DELETE FROM tasks WHERE plan_id IN (SELECT id FROM plans WHERE user_id = ?)').bind(uid),
    env.DB.prepare('DELETE FROM plan_revisions WHERE plan_id IN (SELECT id FROM plans WHERE user_id = ?)').bind(uid),
    env.DB.prepare('DELETE FROM plans WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid)
  ]);
  return json({ ok: true, deleted: true }, 200, { 'set-cookie': clearCookieHeader(request) });
}

function validatePlan(input) {
  const errors = [];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const successCriteria = typeof input.success_criteria === 'string' ? input.success_criteria.trim() : '';
  const priority = input.priority;
  const estimated = Number(input.estimated_minutes);

  if (!title || title.length > 120) errors.push('계획명은 1~120자여야 합니다.');
  if (!isDate(input.start_date)) errors.push('시작일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  if (!isDate(input.end_date)) errors.push('종료일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  if (isDate(input.start_date) && isDate(input.end_date) && input.start_date > input.end_date) errors.push('종료일은 시작일보다 빠를 수 없습니다.');
  if (!['low', 'medium', 'high'].includes(priority)) errors.push('우선순위는 low, medium, high 중 하나여야 합니다.');
  if (!successCriteria || successCriteria.length > 1000) errors.push('성공 기준은 1~1000자여야 합니다.');
  if (!Number.isInteger(estimated) || estimated < 0) errors.push('예상 시간은 0 이상의 정수(분)여야 합니다.');

  return {
    errors,
    value: {
      title,
      start_date: input.start_date,
      end_date: input.end_date,
      priority,
      success_criteria: successCriteria,
      estimated_minutes: estimated,
      carryover_text: typeof input.carryover_text === 'string' ? input.carryover_text.trim() || null : null,
      source_reflection_id: input.source_reflection_id === null || input.source_reflection_id === undefined || input.source_reflection_id === ''
        ? null
        : (Number.isInteger(Number(input.source_reflection_id)) && Number(input.source_reflection_id) > 0
            ? Number(input.source_reflection_id) : null)
    }
  };
}

function validateTask(input) {
  const errors = [];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const tag = typeof input.tag === 'string' ? input.tag.trim() : '';
  const estimated = Number(input.estimated_minutes);
  const priority = input.priority;
  if (!title || title.length > 200) errors.push('할 일 제목은 1~200자여야 합니다.');
  if (!isDate(input.due_date)) errors.push('마감일은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.');
  if (!['low', 'medium', 'high'].includes(priority)) errors.push('우선순위는 low, medium, high 중 하나여야 합니다.');
  if (tag.length > 50) errors.push('태그는 50자 이하여야 합니다.');
  if (!Number.isInteger(estimated) || estimated < 0) errors.push('예상 시간은 0 이상의 정수(분)여야 합니다.');
  return { errors, value: { title, due_date: input.due_date, priority, tag, estimated_minutes: estimated } };
}

function validateExecution(input) {
  const errors = [];
  const startedAt = typeof input.started_at === 'string' ? input.started_at : '';
  const endedAt = typeof input.ended_at === 'string' ? input.ended_at : '';
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  const blockerReason = typeof input.blocker_reason === 'string' ? input.blocker_reason.trim() : '';
  if (!startedAt || !Number.isFinite(startMs)) errors.push('시작 시각이 올바르지 않습니다.');
  if (!endedAt || !Number.isFinite(endMs)) errors.push('끝난 시각이 올바르지 않습니다.');
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) errors.push('끝난 시각은 시작 시각보다 빠를 수 없습니다.');
  if (blockerReason.length > 1000) errors.push('막혔던 이유는 1000자 이하여야 합니다.');
  const actualMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.round((endMs - startMs) / 60000) : 0;
  return { errors, value: {
    started_at: Number.isFinite(startMs) ? new Date(startMs).toISOString() : startedAt,
    ended_at: Number.isFinite(endMs) ? new Date(endMs).toISOString() : endedAt,
    actual_minutes: actualMinutes,
    blocker_reason: blockerReason || null
  }};
}

function validateReflection(input) {
  const errors = [];
  const insight = typeof input.insight === 'string' ? input.insight.trim() : '';
  const nextImprovement = typeof input.next_improvement === 'string' ? input.next_improvement.trim() : '';
  if (insight.length > 3000) errors.push('돌아보기 내용은 3000자 이하여야 합니다.');
  if (!nextImprovement || nextImprovement.length > 1000) errors.push('다음 계획으로 넘길 고칠 점은 1~1000자여야 합니다.');
  return { errors, value: { insight, next_improvement: nextImprovement } };
}

async function ownedPlan(env, userId, id) {
  return env.DB.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').bind(id, userId).first();
}

async function ownedTask(env, userId, id) {
  return env.DB.prepare(`
    SELECT t.* FROM tasks t JOIN plans p ON p.id = t.plan_id
    WHERE t.id = ? AND p.user_id = ? AND t.deleted_at IS NULL
  `).bind(id, userId).first();
}

async function ownedReflection(env, userId, id) {
  return env.DB.prepare(`
    SELECT r.* FROM reflections r JOIN plans p ON p.id = r.plan_id
    WHERE r.id = ? AND p.user_id = ?
  `).bind(id, userId).first();
}

async function getPlanSummary(env, userId, planId) {
  const plan = await ownedPlan(env, userId, planId);
  if (!plan) return null;
  const today = seoulToday();
  const counts = await env.DB.prepare(`
    SELECT COUNT(*) AS plan_count,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
      COALESCE(SUM(CASE WHEN status != 'completed' AND due_date < ? THEN 1 ELSE 0 END), 0) AS overdue_count,
      COALESCE(SUM(estimated_minutes), 0) AS estimated_minutes
    FROM tasks WHERE plan_id = ? AND deleted_at IS NULL
  `).bind(today, planId).first();
  const blocked = await env.DB.prepare(`
    SELECT COUNT(*) AS blocked_count FROM tasks t
    WHERE t.plan_id = ? AND t.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM execution_logs l WHERE l.task_id = t.id
        AND length(trim(COALESCE(l.blocker_reason, ''))) > 0)
  `).bind(planId).first();
  const actual = await env.DB.prepare(`
    SELECT COALESCE(SUM(l.actual_minutes), 0) AS actual_minutes
    FROM execution_logs l JOIN tasks t ON t.id = l.task_id
    WHERE t.plan_id = ? AND t.deleted_at IS NULL
  `).bind(planId).first();
  const estimatedMinutes = Number(counts?.estimated_minutes || 0);
  const actualMinutes = Number(actual?.actual_minutes || 0);
  return {
    today_seoul: today,
    plan_count: Number(counts?.plan_count || 0),
    completed_count: Number(counts?.completed_count || 0),
    overdue_count: Number(counts?.overdue_count || 0),
    blocked_count: Number(blocked?.blocked_count || 0),
    estimated_minutes: estimatedMinutes,
    actual_minutes: actualMinutes,
    difference_minutes: actualMinutes - estimatedMinutes
  };
}

async function listPlans(env, userId) {
  const result = await env.DB.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM plan_revisions r WHERE r.plan_id = p.id) AS revision_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) AS task_count
    FROM plans p
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC, p.id DESC
  `).bind(userId).all();
  return json({ ok: true, plans: result.results });
}

async function getPlan(env, userId, id) {
  const plan = await ownedPlan(env, userId, id);
  if (!plan) return notFound('계획을 찾을 수 없습니다.');
  const revisions = await env.DB.prepare('SELECT * FROM plan_revisions WHERE plan_id = ? ORDER BY revision_no DESC').bind(id).all();
  const tasks = await env.DB.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM completion_events c WHERE c.task_id = t.id AND c.reverted_at IS NULL) AS active_completion_events,
      (SELECT COALESCE(SUM(l.actual_minutes), 0) FROM execution_logs l WHERE l.task_id = t.id) AS actual_minutes,
      CASE WHEN EXISTS (SELECT 1 FROM execution_logs l WHERE l.task_id = t.id
        AND length(trim(COALESCE(l.blocker_reason, ''))) > 0) THEN 1 ELSE 0 END AS has_blocker
    FROM tasks t
    WHERE t.plan_id = ? AND t.deleted_at IS NULL
    ORDER BY t.due_date ASC,
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
      t.created_at ASC, t.id ASC
  `).bind(id).all();
  const executions = await env.DB.prepare(`
    SELECT l.*, t.title AS task_title, t.estimated_minutes AS task_estimated_minutes
    FROM execution_logs l JOIN tasks t ON t.id = l.task_id
    WHERE t.plan_id = ? AND t.deleted_at IS NULL
    ORDER BY l.started_at DESC, l.id DESC
  `).bind(id).all();
  const reflection = await env.DB.prepare('SELECT * FROM reflections WHERE plan_id = ? ORDER BY id DESC LIMIT 1').bind(id).first();
  const summary = await getPlanSummary(env, userId, id);
  return json({ ok: true, plan, revisions: revisions.results, tasks: tasks.results, executions: executions.results, reflection: reflection || null, summary });
}

async function createPlan(request, env, userId) {
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validatePlan(input);
  if (errors.length) return badRequest('계획 입력값을 확인해 주세요.', errors);

  let source = null;
  if (value.source_reflection_id) {
    source = await ownedReflection(env, userId, value.source_reflection_id);
    if (!source) return badRequest('가져올 돌아보기 기록을 찾을 수 없습니다.');
  }
  const result = await env.DB.prepare(`
    INSERT INTO plans (user_id, title, start_date, end_date, priority, success_criteria,
      estimated_minutes, carryover_text, source_reflection_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(userId, value.title, value.start_date, value.end_date, value.priority,
    value.success_criteria, value.estimated_minutes, value.carryover_text, value.source_reflection_id).run();
  const newPlanId = Number(result.meta.last_row_id);
  if (source && value.carryover_text) {
    await env.DB.prepare(`INSERT INTO carryovers (source_plan_id, source_reflection_id, target_plan_id, content)
      VALUES (?, ?, ?, ?)`).bind(source.plan_id, source.id, newPlanId, value.carryover_text).run();
  }
  return json({ ok: true, id: newPlanId }, 201);
}

async function updatePlan(request, env, userId, id) {
  const current = await ownedPlan(env, userId, id);
  if (!current) return notFound('수정할 계획을 찾을 수 없습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validatePlan(input);
  if (errors.length) return badRequest('계획 입력값을 확인해 주세요.', errors);
  if (value.source_reflection_id && !(await ownedReflection(env, userId, value.source_reflection_id))) {
    return badRequest('가져올 돌아보기 기록을 찾을 수 없습니다.');
  }
  const rev = await env.DB.prepare('SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_no FROM plan_revisions WHERE plan_id = ?').bind(id).first();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO plan_revisions (
      plan_id, revision_no, title, start_date, end_date, priority, success_criteria,
      estimated_minutes, carryover_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, rev.next_no, current.title, current.start_date, current.end_date, current.priority,
      current.success_criteria, current.estimated_minutes, current.carryover_text),
    env.DB.prepare(`UPDATE plans SET title = ?, start_date = ?, end_date = ?, priority = ?,
      success_criteria = ?, estimated_minutes = ?, carryover_text = ?, source_reflection_id = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?`
    ).bind(value.title, value.start_date, value.end_date, value.priority, value.success_criteria,
      value.estimated_minutes, value.carryover_text, value.source_reflection_id, id, userId)
  ]);
  return json({ ok: true, id, saved_revision: rev.next_no });
}

async function createTask(request, env, userId, planId) {
  if (!(await ownedPlan(env, userId, planId))) return notFound('할 일을 추가할 계획을 찾을 수 없습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validateTask(input);
  if (errors.length) return badRequest('할 일 입력값을 확인해 주세요.', errors);
  const result = await env.DB.prepare(`INSERT INTO tasks (plan_id, title, due_date, priority, tag, estimated_minutes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'in_progress')`
  ).bind(planId, value.title, value.due_date, value.priority, value.tag, value.estimated_minutes).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function updateTask(request, env, userId, id) {
  if (!(await ownedTask(env, userId, id))) return notFound('수정할 할 일을 찾을 수 없습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validateTask(input);
  if (errors.length) return badRequest('할 일 입력값을 확인해 주세요.', errors);
  await env.DB.prepare(`UPDATE tasks SET title = ?, due_date = ?, priority = ?, tag = ?, estimated_minutes = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL`
  ).bind(value.title, value.due_date, value.priority, value.tag, value.estimated_minutes, id).run();
  return json({ ok: true, id });
}

async function completeTask(env, userId, id) {
  if (!(await ownedTask(env, userId, id))) return notFound('완료할 할 일을 찾을 수 없습니다.');
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO completion_events (task_id, completed_at, reverted_at)
      VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)`).bind(id),
    env.DB.prepare(`UPDATE tasks SET status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND deleted_at IS NULL`).bind(id)
  ]);
  const active = await env.DB.prepare('SELECT COUNT(*) AS count FROM completion_events WHERE task_id = ? AND reverted_at IS NULL').bind(id).first();
  return json({ ok: true, id, active_completion_events: Number(active?.count || 0) });
}

async function reopenTask(env, userId, id) {
  if (!(await ownedTask(env, userId, id))) return notFound('되돌릴 할 일을 찾을 수 없습니다.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE completion_events SET reverted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE task_id = ? AND reverted_at IS NULL`).bind(id),
    env.DB.prepare(`UPDATE tasks SET status = 'in_progress', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ? AND deleted_at IS NULL`).bind(id)
  ]);
  return json({ ok: true, id });
}

async function deleteTask(env, userId, id) {
  if (!(await ownedTask(env, userId, id))) return notFound('지울 할 일을 찾을 수 없습니다.');
  await env.DB.prepare(`UPDATE tasks SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
  return json({ ok: true, id });
}

async function createExecution(request, env, userId, taskId) {
  const task = await ownedTask(env, userId, taskId);
  if (!task) return notFound('실행 기록을 추가할 할 일을 찾을 수 없습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validateExecution(input);
  if (errors.length) return badRequest('실행 기록 입력값을 확인해 주세요.', errors);
  const result = await env.DB.prepare(`INSERT INTO execution_logs (task_id, started_at, ended_at, actual_minutes, blocker_reason)
    VALUES (?, ?, ?, ?, ?)`).bind(taskId, value.started_at, value.ended_at, value.actual_minutes, value.blocker_reason).run();
  return json({ ok: true, id: result.meta.last_row_id, task_id: taskId,
    expected_minutes: Number(task.estimated_minutes || 0), actual_minutes: value.actual_minutes }, 201);
}

async function saveReflection(request, env, userId, planId) {
  if (!(await ownedPlan(env, userId, planId))) return notFound('돌아보기를 저장할 계획을 찾을 수 없습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validateReflection(input);
  if (errors.length) return badRequest('돌아보기 입력값을 확인해 주세요.', errors);
  const current = await env.DB.prepare('SELECT * FROM reflections WHERE plan_id = ? ORDER BY id DESC LIMIT 1').bind(planId).first();
  let reflectionId;
  if (current) {
    await env.DB.prepare(`UPDATE reflections SET insight = ?, next_improvement = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(value.insight, value.next_improvement, current.id).run();
    reflectionId = Number(current.id);
  } else {
    const result = await env.DB.prepare('INSERT INTO reflections (plan_id, insight, next_improvement) VALUES (?, ?, ?)')
      .bind(planId, value.insight, value.next_improvement).run();
    reflectionId = Number(result.meta.last_row_id);
  }
  const reflection = await env.DB.prepare('SELECT * FROM reflections WHERE id = ?').bind(reflectionId).first();
  return json({ ok: true, reflection });
}

function fixedStudyRules(roundingDigits, weekStartDay) {
  return {
    calculation_rule: '각 날짜의 입력값을 그대로 사용한다. 합계는 모든 기록값의 합, 평균은 합계를 기록 수로 나눈 값이다.',
    missing_rule: '기록이 없는 날짜는 0으로 채우지 않고 5일 기록이 완성되지 않은 상태로 표시한다.',
    duplicate_rule: '같은 Asia/Seoul 날짜의 두 번째 기록은 저장하지 않고 기존 한 건을 유지한다.',
    outlier_rule: '유난히 큰 값이나 작은 값도 임의로 제외하지 않고 실제 입력값과 메모를 그대로 보존한다.',
    rounding_digits: roundingDigits,
    week_start_day: weekStartDay
  };
}

async function getUsageStudy(env, userId) {
  const config = await env.DB.prepare('SELECT * FROM usage_study_config WHERE user_id = ?').bind(userId).first();
  const recordsResult = await env.DB.prepare('SELECT * FROM usage_daily_records WHERE user_id = ? ORDER BY record_date ASC, id ASC').bind(userId).all();
  const change = await env.DB.prepare('SELECT * FROM plan_rule_changes WHERE user_id = ?').bind(userId).first();
  const records = recordsResult.results || [];
  const values = records.map(r => Number(r.metric_value));
  const digits = Number(config?.rounding_digits ?? 1);
  const factor = 10 ** digits;
  const sumRaw = values.reduce((a, b) => a + b, 0);
  const avgRaw = values.length ? sumRaw / values.length : 0;
  const summary = {
    record_count: records.length,
    complete_five_days: records.length === 5,
    sum: Math.round(sumRaw * factor) / factor,
    average: Math.round(avgRaw * factor) / factor,
    rounding_digits: digits,
    next_record_date: seoulToday(),
    rule_change_required_before_next_record: records.length === 2 && !change
  };
  return json({ ok: true, config: config || null, records, rule_change: change || null, summary });
}

async function saveStudySetup(request, env, userId) {
  const existingRecords = await env.DB.prepare('SELECT COUNT(*) AS count FROM usage_daily_records WHERE user_id = ?').bind(userId).first();
  if (Number(existingRecords?.count || 0) > 0) return conflict('STUDY_ALREADY_STARTED', '첫 기록을 저장한 뒤에는 1일차 기준을 바꿀 수 없습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  const metricName = typeof input.metric_name === 'string' ? input.metric_name.trim() : '';
  const metricUnit = typeof input.metric_unit === 'string' ? input.metric_unit.trim() : '';
  const planRule = typeof input.plan_rule === 'string' ? input.plan_rule.trim() : '';
  const roundingDigits = Number(input.rounding_digits);
  const weekStartDay = input.week_start_day;
  if (!question || question.length > 300) return badRequest('질문은 1~300자로 적어 주세요.');
  if (!metricName || metricName.length > 100) return badRequest('지표 이름은 1~100자로 적어 주세요.');
  if (!metricUnit || metricUnit.length > 30) return badRequest('단위는 1~30자로 적어 주세요.');
  if (!planRule || planRule.length > 500) return badRequest('계획 규칙은 1~500자로 적어 주세요.');
  if (![0, 1, 2].includes(roundingDigits)) return badRequest('반올림 자릿수는 0, 1, 2 중 하나여야 합니다.');
  if (!['monday', 'sunday'].includes(weekStartDay)) return badRequest('주 시작 요일을 선택해 주세요.');
  const fixed = fixedStudyRules(roundingDigits, weekStartDay);
  await env.DB.prepare(`INSERT INTO usage_study_config (
      user_id, question, metric_name, metric_unit, calculation_rule, plan_rule,
      missing_rule, duplicate_rule, outlier_rule, rounding_digits, week_start_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET question = excluded.question, metric_name = excluded.metric_name,
      metric_unit = excluded.metric_unit, calculation_rule = excluded.calculation_rule, plan_rule = excluded.plan_rule,
      missing_rule = excluded.missing_rule, duplicate_rule = excluded.duplicate_rule, outlier_rule = excluded.outlier_rule,
      rounding_digits = excluded.rounding_digits, week_start_day = excluded.week_start_day,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  ).bind(userId, question, metricName, metricUnit, fixed.calculation_rule, planRule,
    fixed.missing_rule, fixed.duplicate_rule, fixed.outlier_rule, fixed.rounding_digits, fixed.week_start_day).run();
  return json({ ok: true }, 201);
}

async function saveTodayStudyRecord(request, env, userId) {
  const config = await env.DB.prepare('SELECT * FROM usage_study_config WHERE user_id = ?').bind(userId).first();
  if (!config) return conflict('SETUP_REQUIRED', '먼저 1일차 질문·지표·계획 규칙을 고정해 주세요.');
  const records = await env.DB.prepare('SELECT * FROM usage_daily_records WHERE user_id = ? ORDER BY record_date ASC, id ASC').bind(userId).all();
  const rows = records.results || [];
  if (rows.length >= 5) return conflict('FIVE_DAYS_COMPLETE', '서로 다른 실제 날짜 5일 기록이 이미 완성되었습니다.');
  const change = await env.DB.prepare('SELECT id FROM plan_rule_changes WHERE user_id = ?').bind(userId).first();
  if (rows.length === 2 && !change) return conflict('RULE_CHANGE_REQUIRED', '3일차 기록 전에 계획 규칙을 한 번 바꿔야 합니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const metricValue = Number(input.metric_value);
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!Number.isFinite(metricValue)) return badRequest('지표 값은 숫자여야 합니다.');
  if (note.length > 1000) return badRequest('메모는 1000자 이하여야 합니다.');
  const today = seoulToday();
  const existingToday = await env.DB.prepare('SELECT id FROM usage_daily_records WHERE user_id = ? AND record_date = ?').bind(userId, today).first();
  if (existingToday) return conflict('DUPLICATE_DATE', '같은 날짜에는 한 건만 저장합니다. 기존 기록을 유지했습니다.');
  const result = await env.DB.prepare(`INSERT INTO usage_daily_records (user_id, record_date, metric_value, note)
    VALUES (?, ?, ?, ?)`).bind(userId, today, metricValue, note || null).run();
  return json({ ok: true, id: result.meta.last_row_id, record_date: today }, 201);
}

async function changeStudyRule(request, env, userId) {
  const config = await env.DB.prepare('SELECT * FROM usage_study_config WHERE user_id = ?').bind(userId).first();
  if (!config) return conflict('SETUP_REQUIRED', '먼저 1일차 기준을 저장해 주세요.');
  const existing = await env.DB.prepare('SELECT id FROM plan_rule_changes WHERE user_id = ?').bind(userId).first();
  if (existing) return conflict('RULE_ALREADY_CHANGED', '계획 규칙 변경은 2일차 뒤, 3일차 전에 한 번만 기록합니다.');
  const records = await env.DB.prepare('SELECT * FROM usage_daily_records WHERE user_id = ? ORDER BY record_date ASC, id ASC').bind(userId).all();
  const rows = records.results || [];
  if (rows.length !== 2) return conflict('RULE_CHANGE_WINDOW', '계획 규칙은 정확히 2일차 기록 뒤, 3일차 기록 전에만 바꿀 수 있습니다.');
  let input;
  try { input = await readJson(request); } catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const nextRule = typeof input.new_rule === 'string' ? input.new_rule.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!nextRule || nextRule.length > 500) return badRequest('새 계획 규칙은 1~500자로 적어 주세요.');
  if (!reason || reason.length > 1000) return badRequest('바꾼 이유는 1~1000자로 적어 주세요.');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO plan_rule_changes (user_id, previous_rule, new_rule, reason, day1_record_id, day2_record_id)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(userId, config.plan_rule, nextRule, reason, rows[0].id, rows[1].id),
    env.DB.prepare(`UPDATE usage_study_config SET plan_rule = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE user_id = ?`).bind(nextRule, userId)
  ]);
  return json({ ok: true }, 201);
}

async function exportAllData(env, userId) {
  const queries = {
    plans: ['SELECT * FROM plans WHERE user_id = ? ORDER BY id ASC', [userId]],
    plan_revisions: [`SELECT r.* FROM plan_revisions r JOIN plans p ON p.id = r.plan_id WHERE p.user_id = ? ORDER BY r.id ASC`, [userId]],
    tasks: [`SELECT t.* FROM tasks t JOIN plans p ON p.id = t.plan_id WHERE p.user_id = ? ORDER BY t.id ASC`, [userId]],
    execution_logs: [`SELECT l.* FROM execution_logs l JOIN tasks t ON t.id = l.task_id JOIN plans p ON p.id = t.plan_id WHERE p.user_id = ? ORDER BY l.id ASC`, [userId]],
    completion_events: [`SELECT c.* FROM completion_events c JOIN tasks t ON t.id = c.task_id JOIN plans p ON p.id = t.plan_id WHERE p.user_id = ? ORDER BY c.id ASC`, [userId]],
    reflections: [`SELECT r.* FROM reflections r JOIN plans p ON p.id = r.plan_id WHERE p.user_id = ? ORDER BY r.id ASC`, [userId]],
    carryovers: [`SELECT c.* FROM carryovers c JOIN plans p ON p.id = c.source_plan_id WHERE p.user_id = ? ORDER BY c.id ASC`, [userId]],
    usage_study_config: ['SELECT * FROM usage_study_config WHERE user_id = ? ORDER BY id ASC', [userId]],
    usage_daily_records: ['SELECT * FROM usage_daily_records WHERE user_id = ? ORDER BY record_date ASC, id ASC', [userId]],
    plan_rule_changes: ['SELECT * FROM plan_rule_changes WHERE user_id = ? ORDER BY id ASC', [userId]]
  };
  const data = {};
  for (const [name, [sql, binds]] of Object.entries(queries)) {
    const result = await env.DB.prepare(sql).bind(...binds).all();
    data[name] = result.results || [];
  }
  return json({ ok: true, export_format: 'pds-diary-export-v2-auth', exported_at: new Date().toISOString(),
    timezone: 'Asia/Seoul', duration_unit: 'minutes', data });
}

async function handleProtectedApi(request, env, url, auth) {
  const uid = Number(auth.user_id);
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    return json({ ok: true, user: { id: uid, username: auth.username }, session_expires_at: auth.expires_at });
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env, auth);
  if (url.pathname === '/api/auth/password' && request.method === 'PUT') return changePassword(request, env, auth);
  if (url.pathname === '/api/auth/account' && request.method === 'DELETE') return deleteAccount(request, env, auth);
  if (url.pathname === '/api/export' && request.method === 'GET') return exportAllData(env, uid);
  if (url.pathname === '/api/usage-study' && request.method === 'GET') return getUsageStudy(env, uid);
  if (url.pathname === '/api/usage-study/setup' && request.method === 'PUT') return saveStudySetup(request, env, uid);
  if (url.pathname === '/api/usage-study/today' && request.method === 'POST') return saveTodayStudyRecord(request, env, uid);
  if (url.pathname === '/api/usage-study/rule-change' && request.method === 'POST') return changeStudyRule(request, env, uid);
  if (url.pathname === '/api/plans' && request.method === 'GET') return listPlans(env, uid);
  if (url.pathname === '/api/plans' && request.method === 'POST') return createPlan(request, env, uid);

  const planTaskMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/tasks$/);
  if (planTaskMatch && request.method === 'POST') return createTask(request, env, uid, Number(planTaskMatch[1]));
  const reflectionMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/reflection$/);
  if (reflectionMatch && request.method === 'PUT') return saveReflection(request, env, uid, Number(reflectionMatch[1]));
  const planMatch = url.pathname.match(/^\/api\/plans\/(\d+)$/);
  if (planMatch) {
    const id = Number(planMatch[1]);
    if (request.method === 'GET') return getPlan(env, uid, id);
    if (request.method === 'PUT') return updatePlan(request, env, uid, id);
  }
  const executionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/executions$/);
  if (executionMatch && request.method === 'POST') return createExecution(request, env, uid, Number(executionMatch[1]));
  const taskActionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/(complete|reopen)$/);
  if (taskActionMatch && request.method === 'POST') {
    const id = Number(taskActionMatch[1]);
    return taskActionMatch[2] === 'complete' ? completeTask(env, uid, id) : reopenTask(env, uid, id);
  }
  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch) {
    const id = Number(taskMatch[1]);
    if (request.method === 'PUT') return updateTask(request, env, uid, id);
    if (request.method === 'DELETE') return deleteTask(env, uid, id);
  }
  return notFound('API 경로를 찾을 수 없습니다.');
}

async function handleApi(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const row = await env.DB.prepare('SELECT 1 AS db_ok').first();
    return json({ ok: true, db: row?.db_ok === 1 ? 'connected' : 'unknown' });
  }
  if (!assertSameOrigin(request)) return forbidden('다른 출처에서 보낸 상태 변경 요청은 허용하지 않습니다.');
  if (url.pathname === '/api/auth/register' && request.method === 'POST') return register(request, env);
  if (url.pathname === '/api/auth/login' && request.method === 'POST') return login(request, env);

  const auth = await requireAuth(request, env);
  if (!auth) return unauthorized();
  return handleProtectedApi(request, env, url, auth);
}

function securedAssetResponse(response, request) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (new URL(request.url).protocol === 'https:') headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      return securedAssetResponse(await env.ASSETS.fetch(request), request);
    } catch (error) {
      console.error('request failed', error?.message || 'unknown');
      return json({ ok: false, error: 'INTERNAL_ERROR', message: '서버 처리 중 오류가 발생했습니다.' }, 500);
    }
  }
};
