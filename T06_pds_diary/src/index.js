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
      source_reflection_id:
        input.source_reflection_id === null || input.source_reflection_id === undefined || input.source_reflection_id === ''
          ? null
          : (Number.isInteger(Number(input.source_reflection_id)) && Number(input.source_reflection_id) > 0
              ? Number(input.source_reflection_id)
              : null)
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

  const actualMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.round((endMs - startMs) / 60000)
    : 0;

  return {
    errors,
    value: {
      started_at: Number.isFinite(startMs) ? new Date(startMs).toISOString() : startedAt,
      ended_at: Number.isFinite(endMs) ? new Date(endMs).toISOString() : endedAt,
      actual_minutes: actualMinutes,
      blocker_reason: blockerReason || null
    }
  };
}


function seoulToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function validateReflection(input) {
  const errors = [];
  const insight = typeof input.insight === 'string' ? input.insight.trim() : '';
  const nextImprovement = typeof input.next_improvement === 'string' ? input.next_improvement.trim() : '';
  if (insight.length > 3000) errors.push('돌아보기 내용은 3000자 이하여야 합니다.');
  if (!nextImprovement || nextImprovement.length > 1000) errors.push('다음 계획으로 넘길 고칠 점은 1~1000자여야 합니다.');
  return { errors, value: { insight, next_improvement: nextImprovement } };
}

async function getPlanSummary(env, planId) {
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
    SELECT t.*,
      (SELECT COUNT(*) FROM completion_events c WHERE c.task_id = t.id AND c.reverted_at IS NULL) AS active_completion_events,
      (SELECT COALESCE(SUM(l.actual_minutes), 0) FROM execution_logs l WHERE l.task_id = t.id) AS actual_minutes,
      CASE WHEN EXISTS (
        SELECT 1 FROM execution_logs l
        WHERE l.task_id = t.id AND length(trim(COALESCE(l.blocker_reason, ''))) > 0
      ) THEN 1 ELSE 0 END AS has_blocker
    FROM tasks t
    WHERE t.plan_id = ? AND t.deleted_at IS NULL
    ORDER BY t.due_date ASC,
      CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
      t.created_at ASC,
      t.id ASC
  `).bind(id).all();
  const executions = await env.DB.prepare(`
    SELECT l.*, t.title AS task_title, t.estimated_minutes AS task_estimated_minutes
    FROM execution_logs l
    JOIN tasks t ON t.id = l.task_id
    WHERE t.plan_id = ? AND t.deleted_at IS NULL
    ORDER BY l.started_at DESC, l.id DESC
  `).bind(id).all();
  const reflection = await env.DB.prepare(`
    SELECT * FROM reflections WHERE plan_id = ? ORDER BY id DESC LIMIT 1
  `).bind(id).first();
  const summary = await getPlanSummary(env, id);
  return json({ ok: true, plan, revisions: revisions.results, tasks: tasks.results, executions: executions.results, reflection: reflection || null, summary });
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

  const newPlanId = Number(result.meta.last_row_id);
  if (value.source_reflection_id && value.carryover_text) {
    const source = await env.DB.prepare(`SELECT id, plan_id FROM reflections WHERE id = ?`).bind(value.source_reflection_id).first();
    if (source) {
      await env.DB.prepare(`
        INSERT INTO carryovers (source_plan_id, source_reflection_id, target_plan_id, content)
        VALUES (?, ?, ?, ?)
      `).bind(source.plan_id, source.id, newPlanId, value.carryover_text).run();
    }
  }

  return json({ ok: true, id: newPlanId }, 201);
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

async function createExecution(request, env, taskId) {
  const task = await requireActiveTask(env, taskId);
  if (!task) return notFound('실행 기록을 추가할 할 일을 찾을 수 없습니다.');

  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }

  const { errors, value } = validateExecution(input);
  if (errors.length) return badRequest('실행 기록 입력값을 확인해 주세요.', errors);

  const result = await env.DB.prepare(`
    INSERT INTO execution_logs (task_id, started_at, ended_at, actual_minutes, blocker_reason)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    taskId, value.started_at, value.ended_at, value.actual_minutes, value.blocker_reason
  ).run();

  return json({
    ok: true,
    id: result.meta.last_row_id,
    task_id: taskId,
    expected_minutes: Number(task.estimated_minutes || 0),
    actual_minutes: value.actual_minutes
  }, 201);
}


async function saveReflection(request, env, planId) {
  const plan = await env.DB.prepare('SELECT id FROM plans WHERE id = ?').bind(planId).first();
  if (!plan) return notFound('돌아보기를 저장할 계획을 찾을 수 없습니다.');
  let input;
  try { input = await readJson(request); }
  catch { return badRequest('요청 본문은 application/json 형식이어야 합니다.'); }
  const { errors, value } = validateReflection(input);
  if (errors.length) return badRequest('돌아보기 입력값을 확인해 주세요.', errors);
  const current = await env.DB.prepare(`SELECT * FROM reflections WHERE plan_id = ? ORDER BY id DESC LIMIT 1`).bind(planId).first();
  let reflectionId;
  if (current) {
    await env.DB.prepare(`
      UPDATE reflections SET insight = ?, next_improvement = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?
    `).bind(value.insight, value.next_improvement, current.id).run();
    reflectionId = Number(current.id);
  } else {
    const result = await env.DB.prepare(`
      INSERT INTO reflections (plan_id, insight, next_improvement) VALUES (?, ?, ?)
    `).bind(planId, value.insight, value.next_improvement).run();
    reflectionId = Number(result.meta.last_row_id);
  }
  const reflection = await env.DB.prepare('SELECT * FROM reflections WHERE id = ?').bind(reflectionId).first();
  return json({ ok: true, reflection });
}

async function exportAllData(env) {
  const tableNames = [
    'plans',
    'plan_revisions',
    'tasks',
    'execution_logs',
    'completion_events',
    'reflections',
    'carryovers'
  ];

  const data = {};
  for (const table of tableNames) {
    const result = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
    data[table] = result.results || [];
  }

  return json({
    ok: true,
    export_format: 'pds-diary-export-v1',
    exported_at: new Date().toISOString(),
    timezone: 'Asia/Seoul',
    duration_unit: 'minutes',
    data
  });
}

async function handleApi(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    const row = await env.DB.prepare('SELECT 1 AS db_ok').first();
    return json({ ok: true, db: row?.db_ok === 1 ? 'connected' : 'unknown' });
  }

  if (request.method === 'GET' && url.pathname === '/api/export') {
    return exportAllData(env);
  }

  if (url.pathname === '/api/plans' && request.method === 'GET') return listPlans(env);
  if (url.pathname === '/api/plans' && request.method === 'POST') return createPlan(request, env);

  const planTaskMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/tasks$/);
  if (planTaskMatch && request.method === 'POST') {
    return createTask(request, env, Number(planTaskMatch[1]));
  }

  const reflectionMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/reflection$/);
  if (reflectionMatch && request.method === 'PUT') {
    return saveReflection(request, env, Number(reflectionMatch[1]));
  }

  const planMatch = url.pathname.match(/^\/api\/plans\/(\d+)$/);
  if (planMatch) {
    const id = Number(planMatch[1]);
    if (request.method === 'GET') return getPlan(env, id);
    if (request.method === 'PUT') return updatePlan(request, env, id);
  }

  const executionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/executions$/);
  if (executionMatch && request.method === 'POST') {
    return createExecution(request, env, Number(executionMatch[1]));
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
