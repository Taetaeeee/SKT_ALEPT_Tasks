const $ = (s) => document.querySelector(s);
let selectedPlanId = null;
let selectedPlan = null;
let allTasks = [];
let editingTaskId = null;
let allExecutions = [];
let currentSummary = null;
let selectedReflection = null;

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

async function exportAllData() {
  const button = $('#export-btn');
  const original = button.textContent;
  button.disabled = true;
  setText(button, '내보내는 중…');
  try {
    const data = await api('/api/export', { headers: {} });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    link.href = url;
    link.download = `pds-diary-export-${date}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    window.alert(`내보내기에 실패했습니다. ${error.message}`);
  } finally {
    button.disabled = false;
    setText(button, original);
  }
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
    carryover_text: $('#carryover-text').value,
    source_reflection_id: $('#source-reflection-id').value || null
  };
}

function resetPlanForm() {
  selectedPlanId = null;
  selectedPlan = null;
  allTasks = [];
  $('#plan-form').reset();
  $('#plan-id').value = '';
  $('#source-reflection-id').value = '';
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
  allExecutions = [];
  setText($('#do-plan-hint'), '저장된 계획을 선택하면 실행 기록을 남길 수 있습니다.');
  $('#execution-form').hidden = true;
  $('#execution-list').innerHTML = '<p class="meta">계획을 먼저 선택하세요.</p>';
  setText($('#execution-message'), '');
  resetSee();
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
  const { plan, revisions, tasks, executions, reflection, summary } = await api(`/api/plans/${id}`, { headers: {} });
  selectedPlanId = id;
  selectedPlan = plan;
  allTasks = tasks || [];
  allExecutions = executions || [];
  selectedReflection = reflection || null;
  currentSummary = summary || null;
  $('#plan-id').value = id;
  $('#source-reflection-id').value = plan.source_reflection_id || '';
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
  setupExecutionForm();
  renderExecutions();
  renderSee();
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
    const completionText = task.status === 'completed' ? ` · 활성 완료기록 ${Number(task.active_completion_events || 0)}건` : '';
    meta.textContent = `마감 ${task.due_date} · 우선순위 ${priorityLabel[task.priority]} · 태그 ${task.tag || '없음'} · 예상 ${task.estimated_minutes}분${completionText}`;
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

function setupExecutionForm() {
  const form = $('#execution-form');
  const select = $('#execution-task');
  select.replaceChildren();
  if (!selectedPlanId || !allTasks.length) {
    form.hidden = true;
    setText($('#do-plan-hint'), selectedPlanId ? '실행 기록을 남길 할 일이 없습니다.' : '저장된 계획을 선택하면 실행 기록을 남길 수 있습니다.');
    return;
  }

  for (const task of allTasks) {
    select.append(new Option(`${task.title} · 예상 ${task.estimated_minutes}분`, String(task.id)));
  }
  form.hidden = false;
  setText($('#do-plan-hint'), `현재 계획: ${selectedPlan.title} · 실제 수행은 계획값과 별도로 저장됩니다.`);
  updateExecutionExpected();
  updateActualMinutes();
}

function selectedExecutionTask() {
  const id = Number($('#execution-task').value);
  return allTasks.find(task => Number(task.id) === id) || null;
}

function updateExecutionExpected() {
  const task = selectedExecutionTask();
  if (!task) return setText($('#execution-expected'), '할 일을 선택하세요.');
  setText($('#execution-expected'), `원래 계획값: 예상 ${task.estimated_minutes}분 · 현재 상태 ${task.status === 'completed' ? '완료' : '진행 중'} · 이 값은 실행 기록 저장 후에도 바뀌지 않습니다.`);
}

function resetExecutionInputs() {
  $('#execution-start').value = '';
  $('#execution-end').value = '';
  $('#execution-blocker').value = '';
  setText($('#execution-actual'), '확인 필요');
  setText($('#execution-message'), '');
  $('#execution-message').className = '';
}

function handleExecutionTaskChange() {
  updateExecutionExpected();
  resetExecutionInputs();
}

function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calculatedActualMinutes() {
  const start = $('#execution-start').value ? new Date($('#execution-start').value) : null;
  const end = $('#execution-end').value ? new Date($('#execution-end').value) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.round((end - start) / 60000);
}

function updateActualMinutes() {
  const value = calculatedActualMinutes();
  setText($('#execution-actual'), value === null ? '확인 필요' : `${value}분`);
}

function formatSeoulDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function renderExecutions() {
  const root = $('#execution-list');
  root.replaceChildren();
  if (!selectedPlanId) {
    const p = document.createElement('p'); p.className = 'meta'; p.textContent = '계획을 먼저 선택하세요.'; root.append(p); return;
  }
  if (!allExecutions.length) {
    const p = document.createElement('p'); p.className = 'meta'; p.textContent = '아직 실행 기록이 없습니다. 실제로 한 일을 기록해 보세요.'; root.append(p); return;
  }

  for (const log of allExecutions) {
    const card = document.createElement('article'); card.className = 'execution-card';
    const header = document.createElement('div'); header.className = 'execution-title-row';
    const title = document.createElement('strong'); title.textContent = log.task_title;
    const diff = Number(log.actual_minutes) - Number(log.task_estimated_minutes);
    const badge = document.createElement('span'); badge.className = `diff-badge ${diff > 0 ? 'over' : diff < 0 ? 'under' : 'same'}`;
    badge.textContent = diff === 0 ? '예상과 같음' : `${diff > 0 ? '+' : ''}${diff}분`;
    header.append(title, badge);

    const time = document.createElement('div'); time.className = 'meta';
    time.textContent = `${formatSeoulDateTime(log.started_at)} → ${formatSeoulDateTime(log.ended_at)} · 예상 ${log.task_estimated_minutes}분 · 실제 ${log.actual_minutes}분`;
    const blocker = document.createElement('div'); blocker.className = 'blocker-line';
    const label = document.createElement('strong'); label.textContent = '막혔던 이유 '; blocker.append(label, document.createTextNode(log.blocker_reason || '없음'));
    card.append(header, time, blocker); root.append(card);
  }
}


function resetSee() {
  currentSummary = null;
  selectedReflection = null;
  setText($('#see-plan-hint'), '저장된 계획을 선택하면 집계와 근거 기록을 확인할 수 있습니다.');
  $('#see-summary').hidden = true;
  setText($('#evidence-title'), '근거 기록');
  setText($('#evidence-description'), '위 숫자를 누르면 해당 집계의 근거가 표시됩니다.');
  $('#evidence-list').innerHTML = '<p class="meta">집계 숫자를 선택하세요.</p>';
  $('#reflection-form').reset();
  $('#carryover-btn').disabled = true;
  setText($('#reflection-message'), '');
}

function signedMinutes(value) {
  const n = Number(value || 0);
  return `${n > 0 ? '+' : ''}${n}분`;
}

function renderSee() {
  if (!selectedPlanId || !currentSummary) return resetSee();
  $('#see-summary').hidden = false;
  setText($('#see-plan-hint'), `현재 계획: ${selectedPlan.title} · 집계 숫자를 누르면 근거 기록으로 이동합니다.`);
  setText($('#see-plan-count'), currentSummary.plan_count);
  setText($('#see-completed-count'), currentSummary.completed_count);
  setText($('#see-overdue-count'), currentSummary.overdue_count);
  setText($('#see-blocked-count'), currentSummary.blocked_count);
  setText($('#see-estimated'), `${currentSummary.estimated_minutes}분`);
  setText($('#see-actual'), `${currentSummary.actual_minutes}분`);
  setText($('#see-difference'), signedMinutes(currentSummary.difference_minutes));
  setText($('#see-overdue-note'), `${currentSummary.today_seoul} 이전 · 미완료`);

  $('#reflection-insight').value = selectedReflection?.insight || '';
  $('#reflection-next').value = selectedReflection?.next_improvement || '';
  $('#carryover-btn').disabled = !selectedReflection?.id || !selectedReflection?.next_improvement;
  renderEvidence('all');
}

function evidenceItem(title, meta, extra = '') {
  const item = document.createElement('article');
  item.className = 'evidence-item';
  const strong = document.createElement('strong'); strong.textContent = title;
  const detail = document.createElement('div'); detail.className = 'meta'; detail.textContent = meta;
  item.append(strong, detail);
  if (extra) {
    const more = document.createElement('div'); more.className = 'blocker-evidence'; more.textContent = extra; item.append(more);
  }
  return item;
}

function renderEvidence(type) {
  const root = $('#evidence-list');
  root.replaceChildren();
  const today = currentSummary?.today_seoul || '';
  const configs = {
    all: ['계획 수의 근거', '현재 계획에 딸린 지우지 않은 할 일 전체입니다.'],
    completed: ['완료 수의 근거', '현재 완료 상태인 할 일만 표시합니다.'],
    overdue: ['지연 수의 근거', `완료되지 않았고 마감일이 서울 시간 오늘(${today})보다 앞선 할 일입니다.`],
    blocked: ['막힘 수의 근거', '실행 기록 중 막혔던 이유가 하나라도 있는 할 일을 한 번씩 셉니다.'],
    expected: ['예상 시간의 근거', '지우지 않은 할 일의 예상 시간을 합산합니다.'],
    actual: ['실제 시간의 근거', '지우지 않은 할 일에 연결된 실행 기록의 실제 시간을 합산합니다.'],
    difference: ['시간 차이의 근거', '할 일별 실제 시간 합계에서 예상 시간을 뺀 값을 확인합니다.']
  };
  const [title, description] = configs[type] || configs.all;
  setText($('#evidence-title'), title);
  setText($('#evidence-description'), description);

  if (type === 'actual') {
    if (!allExecutions.length) root.append(evidenceItem('실행 기록 없음', '실제 시간 0분'));
    for (const log of allExecutions) {
      root.append(evidenceItem(log.task_title, `${formatSeoulDateTime(log.started_at)} → ${formatSeoulDateTime(log.ended_at)} · 실제 ${log.actual_minutes}분`, log.blocker_reason ? `막힘: ${log.blocker_reason}` : ''));
    }
    return;
  }

  let tasks = [...allTasks];
  if (type === 'completed') tasks = tasks.filter(t => t.status === 'completed');
  if (type === 'overdue') tasks = tasks.filter(t => t.status !== 'completed' && t.due_date < today);
  if (type === 'blocked') tasks = tasks.filter(t => Number(t.has_blocker) === 1);

  if (!tasks.length) {
    root.append(evidenceItem('해당 기록 없음', type === 'overdue' ? '현재 지연 할 일이 0건입니다.' : '현재 조건에 해당하는 기록이 없습니다.'));
    return;
  }

  for (const task of tasks) {
    const actual = Number(task.actual_minutes || 0);
    const expected = Number(task.estimated_minutes || 0);
    let meta = `상태 ${task.status === 'completed' ? '완료' : '진행 중'} · 마감 ${task.due_date} · 예상 ${expected}분`;
    if (['difference','all','blocked'].includes(type)) meta += ` · 실제 ${actual}분 · 차이 ${signedMinutes(actual - expected)}`;
    const blockers = allExecutions.filter(log => Number(log.task_id) === Number(task.id) && (log.blocker_reason || '').trim()).map(log => log.blocker_reason.trim());
    const extra = type === 'blocked' && blockers.length ? `막힘: ${blockers.join(' / ')}` : '';
    root.append(evidenceItem(task.title, meta, extra));
  }
}

function prepareNextPlanFromReflection() {
  if (!selectedReflection?.id || !selectedReflection?.next_improvement) return;
  const reflectionId = selectedReflection.id;
  const improvement = selectedReflection.next_improvement;
  resetPlanForm();
  $('#source-reflection-id').value = reflectionId;
  $('#carryover-text').value = improvement;
  setText($('#form-message'), '이전 SEE의 개선점을 가져왔습니다. 다음 계획의 나머지 항목을 입력해 저장하세요.');
  $('#form-message').className = 'ok';
  document.querySelector('#plan').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#title').focus();
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

$('#execution-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const task = selectedExecutionTask();
  const msg = $('#execution-message'); msg.className = ''; setText(msg, '저장 중…');
  if (!task) { setText(msg, '할 일을 선택해 주세요.'); msg.className = 'error'; return; }
  const startedAt = localInputToIso($('#execution-start').value);
  const endedAt = localInputToIso($('#execution-end').value);
  const actual = calculatedActualMinutes();
  if (!startedAt || !endedAt || actual === null) { setText(msg, '시작·끝 시각을 확인해 주세요.'); msg.className = 'error'; return; }
  try {
    const data = await api(`/api/tasks/${task.id}/executions`, {
      method: 'POST',
      body: JSON.stringify({ started_at: startedAt, ended_at: endedAt, blocker_reason: $('#execution-blocker').value })
    });
    setText(msg, `실행 기록 저장 완료 · 예상 ${data.expected_minutes}분 / 실제 ${data.actual_minutes}분`); msg.className = 'ok';
    resetExecutionInputs();
    await reloadSelectedPlan();
  } catch (err) { setText(msg, err.message); msg.className = 'error'; }
});

$('#execution-task').addEventListener('change', handleExecutionTaskChange);
$('#execution-start').addEventListener('input', updateActualMinutes);
$('#execution-end').addEventListener('input', updateActualMinutes);

for (const button of document.querySelectorAll('.metric-card[data-evidence]')) {
  button.addEventListener('click', () => renderEvidence(button.dataset.evidence));
}

$('#reflection-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPlanId) return;
  const msg = $('#reflection-message'); msg.className = ''; setText(msg, '저장 중…');
  try {
    const data = await api(`/api/plans/${selectedPlanId}/reflection`, {
      method: 'PUT',
      body: JSON.stringify({ insight: $('#reflection-insight').value, next_improvement: $('#reflection-next').value })
    });
    selectedReflection = data.reflection;
    $('#carryover-btn').disabled = false;
    setText(msg, '돌아보기 저장 완료 · 다음 PLAN으로 넘길 수 있습니다.'); msg.className = 'ok';
  } catch (err) { setText(msg, err.message); msg.className = 'error'; }
});

$('#carryover-btn').addEventListener('click', prepareNextPlanFromReflection);

$('#export-btn').addEventListener('click', exportAllData);
$('#refresh-btn').addEventListener('click', checkHealth);
$('#new-plan-btn').addEventListener('click', resetPlanForm);
$('#new-task-btn').addEventListener('click', openNewTaskForm);
$('#cancel-task-btn').addEventListener('click', closeTaskForm);
for (const id of ['task-search','task-status-filter','task-priority-filter','task-tag-filter','task-sort']) {
  $(id.startsWith('#') ? id : `#${id}`).addEventListener(id === 'task-search' ? 'input' : 'change', renderTasks);
}

checkHealth();
loadPlans();
