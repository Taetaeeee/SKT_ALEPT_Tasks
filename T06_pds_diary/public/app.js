const $ = (s) => document.querySelector(s);
let selectedPlanId = null;
let selectedPlan = null;
let allTasks = [];
let editingTaskId = null;

const priorityLabel = { high: '높음', medium: '중간', low: '낮음' };
const priorityRank = { high: 1, medium: 2, low: 3 };
const sortRuleLabel = {
  due: '현재 정렬 기준: 마감일 ↑ → 우선순위 ↓ → 생성순 ↑',
  priority: '현재 정렬 기준: 우선순위 ↓ → 마감일 ↑ → 생성순 ↑',
  created: '현재 정렬 기준: 최근 생성순 ↓ → ID ↓',
  title: '현재 정렬 기준: 제목 가나다순 ↑ → ID ↑'
};

function setText(el, value) { el.textContent = value ?? ''; }

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.details?.join(' / ') || data.message || '요청에 실패했습니다.');
  return data;
}

async function checkHealth() {
  const el = $('#db-status');
  setText(el, '확인 중…'); el.className = '';
  try {
    const data = await api('/api/health', { headers: {} });
    setText(el, data.db === 'connected' ? 'D1 연결됨' : '상태 확인 필요');
    el.className = data.db === 'connected' ? 'ok' : '';
  } catch {
    setText(el, '연결 실패 — 마이그레이션/바인딩 확인'); el.className = 'error';
  }
}

function planPayload() {
  return {
    title: $('#title').value,
    start_date: $('#start-date').value,
    end_date: $('#end-date').value,
    priority: $('#priority').value,
    success_criteria: $('#success-criteria').value,
    estimated_minutes: Number($('#estimated-minutes').value),
    carryover_text: $('#carryover-text').value
  };
}

function resetPlanForm() {
  selectedPlanId = null;
  selectedPlan = null;
  allTasks = [];
  $('#plan-form').reset();
  $('#plan-id').value = '';
  $('#priority').value = 'high';
  setText($('#save-plan-btn'), '계획 저장');
  setText($('#form-message'), '');
  setText($('#revision-list'), '계획을 선택하면 표시됩니다.');
  setText($('#task-plan-hint'), '저장된 계획을 선택하면 할 일을 관리할 수 있습니다.');
  $('#new-task-btn').disabled = true;
  $('#task-form').hidden = true;
  $('#task-controls').hidden = true;
  $('#sort-rule').hidden = true;
  $('#task-list').innerHTML = '<p class="meta">계획을 먼저 선택하세요.</p>';
}

async function loadPlans() {
  const root = $('#plan-list');
  root.replaceChildren();
  try {
    const { plans } = await api('/api/plans', { headers: {} });
    if (!plans.length) {
      const p = document.createElement('p'); p.className = 'meta'; p.textContent = '저장된 계획이 없습니다.'; root.append(p); return;
    }
    for (const plan of plans) {
      const item = document.createElement('div');
      item.className = 'plan-item'; item.tabIndex = 0; item.setAttribute('role','button');
      const title = document.createElement('strong'); title.textContent = plan.title;
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = `${plan.start_date} ~ ${plan.end_date} · 우선순위 ${priorityLabel[plan.priority]} · 예상 ${plan.estimated_minutes}분 · 수정이력 ${plan.revision_count}건 · 할 일 ${plan.task_count}건`;
      item.append(title, meta);
      const open = () => selectPlan(plan.id);
      item.addEventListener('click', open);
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      root.append(item);
    }
  } catch (e) {
    const p = document.createElement('p'); p.className = 'error'; p.textContent = e.message; root.append(p);
  }
}

async function selectPlan(id) {
  const { plan, revisions, tasks } = await api(`/api/plans/${id}`, { headers: {} });
  selectedPlanId = id;
  selectedPlan = plan;
  allTasks = tasks || [];
  $('#plan-id').value = id;
  $('#title').value = plan.title;
  $('#start-date').value = plan.start_date;
  $('#end-date').value = plan.end_date;
  $('#priority').value = plan.priority;
  $('#estimated-minutes').value = plan.estimated_minutes;
  $('#success-criteria').value = plan.success_criteria;
  $('#carryover-text').value = plan.carryover_text || '';
  setText($('#save-plan-btn'), '계획 수정');

  const root = $('#revision-list'); root.replaceChildren();
  if (!revisions.length) {
    const p = document.createElement('p'); p.className = 'meta'; p.textContent = '아직 수정 이력이 없습니다.'; root.append(p);
  } else {
    for (const r of revisions) {
      const item = document.createElement('div'); item.className = 'revision-item';
      const title = document.createElement('strong'); title.textContent = `v${r.revision_no} · ${r.title}`;
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = `${r.start_date} ~ ${r.end_date} · ${priorityLabel[r.priority]} · ${r.estimated_minutes}분 · 저장 ${r.saved_at}`;
      item.append(title, meta); root.append(item);
    }
  }

  setText($('#task-plan-hint'), `현재 계획: ${plan.title}`);
  $('#new-task-btn').disabled = false;
  $('#task-controls').hidden = false;
  $('#sort-rule').hidden = false;
  refreshTagFilter();
  renderTasks();
}

function taskPayload() {
  return {
    title: $('#task-title').value,
    due_date: $('#task-due-date').value,
    priority: $('#task-priority').value,
    tag: $('#task-tag').value,
    estimated_minutes: Number($('#task-estimated-minutes').value)
  };
}

function openNewTaskForm() {
  if (!selectedPlanId) return;
  editingTaskId = null;
  $('#task-form').reset();
  $('#task-id').value = '';
  $('#task-priority').value = 'high';
  if (selectedPlan?.end_date) $('#task-due-date').value = selectedPlan.end_date;
  setText($('#save-task-btn'), '할 일 저장');
  setText($('#task-form-message'), '');
  $('#task-form').hidden = false;
  $('#task-title').focus();
}

function closeTaskForm() {
  editingTaskId = null;
  $('#task-form').hidden = true;
  setText($('#task-form-message'), '');
}

function openEditTaskForm(task) {
  editingTaskId = task.id;
  $('#task-id').value = task.id;
  $('#task-title').value = task.title;
  $('#task-due-date').value = task.due_date;
  $('#task-priority').value = task.priority;
  $('#task-tag').value = task.tag || '';
  $('#task-estimated-minutes').value = task.estimated_minutes;
  setText($('#save-task-btn'), '할 일 수정');
  setText($('#task-form-message'), '');
  $('#task-form').hidden = false;
  $('#task-title').focus();
}

function refreshTagFilter() {
  const select = $('#task-tag-filter');
  const current = select.value;
  select.replaceChildren(new Option('전체', 'all'));
  const tags = [...new Set(allTasks.map(t => (t.tag || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'ko'));
  for (const tag of tags) select.append(new Option(tag, tag));
  select.value = [...select.options].some(o => o.value === current) ? current : 'all';
}

function visibleTasks() {
  const query = $('#task-search').value.trim().toLocaleLowerCase('ko');
  const status = $('#task-status-filter').value;
  const priority = $('#task-priority-filter').value;
  const tag = $('#task-tag-filter').value;
  const sort = $('#task-sort').value;

  const items = allTasks.filter(task => {
    const haystack = `${task.title} ${task.tag || ''}`.toLocaleLowerCase('ko');
    return (!query || haystack.includes(query)) &&
      (status === 'all' || task.status === status) &&
      (priority === 'all' || task.priority === priority) &&
      (tag === 'all' || (task.tag || '') === tag);
  });

  items.sort((a, b) => {
    if (sort === 'priority') {
      return priorityRank[a.priority] - priorityRank[b.priority] || a.due_date.localeCompare(b.due_date) || a.id - b.id;
    }
    if (sort === 'created') return String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id;
    if (sort === 'title') return a.title.localeCompare(b.title, 'ko') || a.id - b.id;
    return a.due_date.localeCompare(b.due_date) || priorityRank[a.priority] - priorityRank[b.priority] || String(a.created_at).localeCompare(String(b.created_at)) || a.id - b.id;
  });
  return items;
}

function actionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className || '';
  button.addEventListener('click', handler);
  return button;
}

function renderTasks() {
  const root = $('#task-list');
  root.replaceChildren();
  setText($('#sort-rule'), sortRuleLabel[$('#task-sort').value]);
  const tasks = visibleTasks();

  if (!tasks.length) {
    const p = document.createElement('p');
    p.className = 'meta';
    p.textContent = allTasks.length ? '현재 검색·필터 조건에 맞는 할 일이 없습니다.' : '아직 할 일이 없습니다. 새 할 일을 추가하세요.';
    root.append(p);
    return;
  }

  for (const task of tasks) {
    const card = document.createElement('article');
    card.className = `task-card ${task.status === 'completed' ? 'is-completed' : ''}`;

    const body = document.createElement('div');
    body.className = 'task-body';
    const titleRow = document.createElement('div');
    titleRow.className = 'task-title-row';
    const title = document.createElement('strong'); title.textContent = task.title;
    const badge = document.createElement('span');
    badge.className = `status-badge ${task.status}`;
    badge.textContent = task.status === 'completed' ? '완료' : '진행 중';
    titleRow.append(title, badge);

    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `마감 ${task.due_date} · 우선순위 ${priorityLabel[task.priority]} · 태그 ${task.tag || '없음'} · 예상 ${task.estimated_minutes}분`;
    body.append(titleRow, meta);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    if (task.status === 'completed') {
      actions.append(actionButton('진행 중으로 되돌리기', 'secondary', () => changeTaskStatus(task.id, 'reopen')));
    } else {
      actions.append(actionButton('완료', '', () => changeTaskStatus(task.id, 'complete')));
    }
    actions.append(actionButton('수정', 'secondary', () => openEditTaskForm(task)));
    actions.append(actionButton('삭제', 'danger', () => removeTask(task)));
    card.append(body, actions);
    root.append(card);
  }
}

async function reloadSelectedPlan() {
  if (!selectedPlanId) return;
  const id = selectedPlanId;
  await loadPlans();
  await selectPlan(id);
}

async function changeTaskStatus(id, action) {
  try {
    await api(`/api/tasks/${id}/${action}`, { method: 'POST', body: '{}' });
    await reloadSelectedPlan();
  } catch (e) {
    window.alert(e.message);
  }
}

async function removeTask(task) {
  if (!window.confirm(`'${task.title}' 할 일을 지울까요?\n삭제한 할 일은 화면과 집계에서 제외됩니다.`)) return;
  try {
    await api(`/api/tasks/${task.id}`, { method: 'DELETE', body: '{}' });
    if (editingTaskId === task.id) closeTaskForm();
    await reloadSelectedPlan();
  } catch (e) {
    window.alert(e.message);
  }
}

$('#plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#form-message'); msg.className = ''; setText(msg, '저장 중…');
  try {
    if (selectedPlanId) {
      const data = await api(`/api/plans/${selectedPlanId}`, { method:'PUT', body:JSON.stringify(planPayload()) });
      setText(msg, `수정 완료 · 이전 계획 v${data.saved_revision} 보존`); msg.className = 'ok';
      await loadPlans(); await selectPlan(selectedPlanId);
    } else {
      const data = await api('/api/plans', { method:'POST', body:JSON.stringify(planPayload()) });
      setText(msg, '계획 저장 완료'); msg.className = 'ok';
      await loadPlans(); await selectPlan(data.id);
    }
  } catch (err) { setText(msg, err.message); msg.className = 'error'; }
});

$('#task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPlanId) return;
  const msg = $('#task-form-message'); msg.className = ''; setText(msg, '저장 중…');
  try {
    if (editingTaskId) {
      await api(`/api/tasks/${editingTaskId}`, { method: 'PUT', body: JSON.stringify(taskPayload()) });
      setText(msg, '할 일 수정 완료');
    } else {
      await api(`/api/plans/${selectedPlanId}/tasks`, { method: 'POST', body: JSON.stringify(taskPayload()) });
      setText(msg, '할 일 저장 완료');
    }
    msg.className = 'ok';
    await reloadSelectedPlan();
    closeTaskForm();
  } catch (err) { setText(msg, err.message); msg.className = 'error'; }
});

$('#refresh-btn').addEventListener('click', checkHealth);
$('#new-plan-btn').addEventListener('click', resetPlanForm);
$('#new-task-btn').addEventListener('click', openNewTaskForm);
$('#cancel-task-btn').addEventListener('click', closeTaskForm);
for (const id of ['task-search','task-status-filter','task-priority-filter','task-tag-filter','task-sort']) {
  $(id.startsWith('#') ? id : `#${id}`).addEventListener(id === 'task-search' ? 'input' : 'change', renderTasks);
}

checkHealth();
loadPlans();
