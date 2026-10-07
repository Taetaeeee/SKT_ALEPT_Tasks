const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function badRequest(message, details = undefined) {
  return json({ ok: false, error: 'BAD_REQUEST', message, details }, 400);
}

function notFound(message = '찾을 수 없습니다.') {
  return json({ ok: false, error: 'NOT_FOUND', message }, 404);
}

function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
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
      source_reflection_id: Number.isInteger(Number(input.source_reflection_id)) ? Number(input.source_reflection_id) : null
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

async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('JSON_REQUIRED');
  return request.json();
}

async function requireActiveTask(env, id) {
  return env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL').bind(id).first();
}

async function listPlans(env) {
  const result = await env.DB.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM plan_revisions r WHERE r.plan_id = p.id) AS revision_count,
      (SELECT COUNT(*) FROM tasks t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) AS task_count
    FROM plans p
    ORDER BY p.created_at DESC, p.id DESC
  `).all();
  return json({ ok: true, plans: result.results });
}

async function getPlan(env, id) {
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first();
  if (!plan) return notFound('계획을 찾을 수 없습니다.');
  const revisions = await env.DB.prepare(`
    SELECT * FROM plan_revisions WHERE plan_id = ? ORDER BY revision_no DESC
  `).bind(id).all();
  const tasks = await env.DB.prepare(`
    SELECT * FROM tasks WHERE plan_id = ? AND deleted_at IS NULL
    ORDER BY due_date ASC,
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
      created_at ASC,
      id ASC
  `).bind(id).all();
  return json({ ok: true, plan, revisions: revisions.results, tasks: tasks.results });
}

async function createPlan(request, env) {
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const { errors, value } = validatePlan(input);
  if (errors.length) return badRequest('계획 입력값을 확인해 주세요.', errors);

  const result = await env.DB.prepare(`
    INSERT INTO plans (
      title, start_date, end_date, priority, success_criteria,
      estimated_minutes, carryover_text, source_reflection_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    value.title, value.start_date, value.end_date, value.priority,
    value.success_criteria, value.estimated_minutes, value.carryover_text,
    value.source_reflection_id
  ).run();

  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function updatePlan(request, env, id) {
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const { errors, value } = validatePlan(input);
  if (errors.length) return badRequest('계획 입력값을 확인해 주세요.', errors);

  const current = await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first();
  if (!current) return notFound('수정할 계획을 찾을 수 없습니다.');

  const rev = await env.DB.prepare(`
    SELECT COALESCE(MAX(revision_no), 0) + 1 AS next_no
    FROM plan_revisions WHERE plan_id = ?
  `).bind(id).first();

  const snapshot = env.DB.prepare(`
    INSERT INTO plan_revisions (
      plan_id, revision_no, title, start_date, end_date, priority,
      success_criteria, estimated_minutes, carryover_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, rev.next_no, current.title, current.start_date, current.end_date,
    current.priority, current.success_criteria, current.estimated_minutes,
    current.carryover_text
  );

  const update = env.DB.prepare(`
    UPDATE plans SET
      title = ?, start_date = ?, end_date = ?, priority = ?,
      success_criteria = ?, estimated_minutes = ?, carryover_text = ?,
      source_reflection_id = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).bind(
    value.title, value.start_date, value.end_date, value.priority,
    value.success_criteria, value.estimated_minutes, value.carryover_text,
    value.source_reflection_id, id
  );

  await env.DB.batch([snapshot, update]);
  return json({ ok: true, id, saved_revision: rev.next_no });
}

async function createTask(request, env, planId) {
  const plan = await env.DB.prepare('SELECT id FROM plans WHERE id = ?').bind(planId).first();
  if (!plan) return notFound('할 일을 추가할 계획을 찾을 수 없습니다.');

  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const { errors, value } = validateTask(input);
  if (errors.length) return badRequest('할 일 입력값을 확인해 주세요.', errors);

  const result = await env.DB.prepare(`
    INSERT INTO tasks (plan_id, title, due_date, priority, tag, estimated_minutes, status)
    VALUES (?, ?, ?, ?, ?, ?, 'in_progress')
  `).bind(planId, value.title, value.due_date, value.priority, value.tag, value.estimated_minutes).run();

  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function updateTask(request, env, id) {
  const task = await requireActiveTask(env, id);
  if (!task) return notFound('수정할 할 일을 찾을 수 없습니다.');

  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const { errors, value } = validateTask(input);
  if (errors.length) return badRequest('할 일 입력값을 확인해 주세요.', errors);

  await env.DB.prepare(`
    UPDATE tasks SET title = ?, due_date = ?, priority = ?, tag = ?, estimated_minutes = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND deleted_at IS NULL
  `).bind(value.title, value.due_date, value.priority, value.tag, value.estimated_minutes, id).run();
  return json({ ok: true, id });
}

async function completeTask(env, id) {
  const task = await requireActiveTask(env, id);
  if (!task) return notFound('완료할 할 일을 찾을 수 없습니다.');

  const completeEvent = env.DB.prepare(`
    INSERT OR IGNORE INTO completion_events (task_id, completed_at, reverted_at)
    VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL)
  `).bind(id);
  const updateTaskStatus = env.DB.prepare(`
    UPDATE tasks SET status = 'completed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id);
  await env.DB.batch([completeEvent, updateTaskStatus]);

  const active = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM completion_events WHERE task_id = ? AND reverted_at IS NULL
  `).bind(id).first();
  return json({ ok: true, id, active_completion_events: Number(active?.count || 0) });
}

async function reopenTask(env, id) {
  const task = await requireActiveTask(env, id);
  if (!task) return notFound('되돌릴 할 일을 찾을 수 없습니다.');

  const revertEvent = env.DB.prepare(`
    UPDATE completion_events
    SET reverted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE task_id = ? AND reverted_at IS NULL
  `).bind(id);
  const updateTaskStatus = env.DB.prepare(`
    UPDATE tasks SET status = 'in_progress', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id);
  await env.DB.batch([revertEvent, updateTaskStatus]);
  return json({ ok: true, id });
}

async function deleteTask(env, id) {
  const task = await requireActiveTask(env, id);
  if (!task) return notFound('지울 할 일을 찾을 수 없습니다.');

  await env.DB.prepare(`
    UPDATE tasks
    SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id).run();
  return json({ ok: true, id });
}

async function handleApi(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const row = await env.DB.prepare('SELECT 1 AS db_ok').first();
    return json({ ok: true, db: row?.db_ok === 1 ? 'connected' : 'unknown' });
  }

  if (url.pathname === '/api/plans' && request.method === 'GET') return listPlans(env);
  if (url.pathname === '/api/plans' && request.method === 'POST') return createPlan(request, env);

  const planTaskMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/tasks$/);
  if (planTaskMatch && request.method === 'POST') {
    return createTask(request, env, Number(planTaskMatch[1]));
  }

  const planMatch = url.pathname.match(/^\/api\/plans\/(\d+)$/);
  if (planMatch) {
    const id = Number(planMatch[1]);
    if (request.method === 'GET') return getPlan(env, id);
    if (request.method === 'PUT') return updatePlan(request, env, id);
  }

  const taskActionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/(complete|reopen)$/);
  if (taskActionMatch && request.method === 'POST') {
    const id = Number(taskActionMatch[1]);
    return taskActionMatch[2] === 'complete' ? completeTask(env, id) : reopenTask(env, id);
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch) {
    const id = Number(taskMatch[1]);
    if (request.method === 'PUT') return updateTask(request, env, id);
    if (request.method === 'DELETE') return deleteTask(env, id);
  }

  return notFound('API 경로를 찾을 수 없습니다.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: 'INTERNAL_ERROR', message: '서버 처리 중 오류가 발생했습니다.' }, 500);
    }
  }
};
