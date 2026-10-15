const $ = (s) => document.querySelector(s);
const USERNAME_RE = /^[a-z0-9._-]{4,40}$/;
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

let currentUser = null;
let studyState = null;

function resetAuthView() {
  $('#login-form').reset();
  $('#register-form').reset();

  const signupBox = $('#auth-shell .signup-box');
  if (signupBox) signupBox.open = false;

  const loginMessage = $('#login-message');
  setText(loginMessage, '');
  loginMessage.className = '';

  const registerMessage = $('#register-message');
  setText(registerMessage, '');
  registerMessage.className = '';
}

function resetUserScopedView() {
  selectedPlanId = null;
  selectedPlan = null;
  allTasks = [];
  editingTaskId = null;
  allExecutions = [];
  currentSummary = null;
  selectedReflection = null;
  studyState = null;

  resetPlanForm();
  $('#task-form').reset();
  $('#execution-form').reset();

  const planList = $('#plan-list');
  planList.replaceChildren();
  const planPlaceholder = document.createElement('p');
  planPlaceholder.className = 'meta';
  planPlaceholder.textContent = '로그인한 계정의 계획을 불러옵니다.';
  planList.append(planPlaceholder);

  $('#study-setup-form').reset();
  $('#study-today-form').reset();
  $('#study-rule-form').reset();
  for (const el of $('#study-setup-form').querySelectorAll('input, textarea, select, button')) el.disabled = false;
  $('#study-rounding-digits').value = '1';
  $('#study-week-start').value = 'monday';
  $('#study-today-form').hidden = true;
  $('#study-rule-form').hidden = true;
  setText($('#study-progress'), '0 / 5일');
  setText($('#study-sum'), '0');
  setText($('#study-average'), '0');
  setText($('#study-change-state'), '아직 없음');
  setText($('#study-calculation-rule'), '각 날짜 입력값 합계와 기록 수 기준 평균');
  setText($('#study-setup-message'), '');
  setText($('#study-today-message'), '');
  setText($('#study-rule-message'), '');
  $('#study-records').innerHTML = '<p class="meta">기준을 저장하면 실제 날짜 기록이 표시됩니다.</p>';

  $('#password-form').reset();
  $('#delete-account-form').reset();
  setText($('#password-message'), '');
  setText($('#delete-message'), '');
  setText($('#signed-user'), '');
}

function showAuth(message = '') {
  currentUser = null;
  resetAuthView();
  resetUserScopedView();
  $('#auth-shell').hidden = false;
  $('#app-shell').hidden = true;
  if (message) {
    const el = $('#login-message');
    setText(el, message);
    el.className = 'error';
  }
}

function showApp(user, expiresAt) {
  currentUser = user;
  $('#auth-shell').hidden = true;
  $('#app-shell').hidden = false;
  const expiry = expiresAt ? new Date(expiresAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '';
  setText($('#signed-user'), `${user.username}${expiry ? ` · 세션 ${expiry}까지` : ''}`);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !['/api/auth/login', '/api/auth/register'].includes(path)) {
      showAuth('세션이 없거나 만료되었습니다. 다시 로그인해 주세요.');
    }
    const error = new Error(data.details?.join(' / ') || data.message || '요청에 실패했습니다.');
    error.code = data.error;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function bootstrap() {
  await checkHealth();
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showAuth();
    return;
  }
  showApp(data.user, data.session_expires_at);
  await Promise.all([loadPlans(), loadUsageStudy()]);
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
  if (!iso) return '-';

  // SQLite/D1 CURRENT_TIMESTAMP는 `YYYY-MM-DD HH:mm:ss` 형태의 UTC 문자열을 반환합니다.
  // 시간대 표기가 없는 이 값을 브라우저 로컬 시간으로 오해하지 않도록 UTC(`Z`)로 명시합니다.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(iso)
    ? `${iso.replace(' ', 'T')}Z`
    : iso;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
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


async function handleLoginSubmit(e) {
  e.preventDefault();
  const msg = $('#login-message');
  msg.className = '';
  const username = $('#login-username').value.trim();
  if (!USERNAME_RE.test(username)) {
    setText(msg, '아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 4~40자여야 합니다.');
    msg.className = 'error';
    return;
  }
  setText(msg, '확인 중…');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: $('#login-password').value })
    });
    $('#login-form').reset();
    resetUserScopedView();
    showApp(data.user, data.session_expires_at);
    setText(msg, '');
    await Promise.all([loadPlans(), loadUsageStudy()]);
  } catch (error) {
    setText(msg, error.message);
    msg.className = 'error';
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const msg = $('#register-message');
  msg.className = '';
  const username = $('#register-username').value.trim();
  if (!USERNAME_RE.test(username)) {
    setText(msg, '아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 4~40자여야 합니다.');
    msg.className = 'error';
    return;
  }
  const password = $('#register-password').value;
  if (password !== $('#register-password-confirm').value) {
    setText(msg, '비밀번호 확인이 일치하지 않습니다.');
    msg.className = 'error';
    return;
  }
  setText(msg, '계정 만드는 중…');
  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    $('#register-form').reset();
    resetUserScopedView();
    showApp(data.user, data.session_expires_at);
    if (data.claimed_legacy_plans > 0) {
      window.alert(`T06에서 저장된 계획 ${data.claimed_legacy_plans}건을 첫 계정 자료로 연결했습니다.`);
    }
    await Promise.all([loadPlans(), loadUsageStudy()]);
  } catch (error) {
    setText(msg, error.message);
    msg.className = 'error';
  }
}

async function logoutNow() {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
  catch { /* 세션이 이미 만료된 경우에도 깨끗한 로그인 화면으로 이동 */ }
  resetAuthView();
  resetUserScopedView();
  window.location.replace('/');
}

function renderUsageStudy(data) {
  studyState = data;
  const config = data.config;
  const records = data.records || [];
  const change = data.rule_change;
  const summary = data.summary || {};
  setText($('#study-progress'), `${records.length} / 5일`);
  setText($('#study-sum'), config ? `${summary.sum} ${config.metric_unit}` : '0');
  setText($('#study-average'), config ? `${summary.average} ${config.metric_unit}` : '0');
  setText($('#study-change-state'), change ? '1회 완료' : '아직 없음');

  const setup = $('#study-setup-form');
  if (config) {
    $('#study-question').value = config.question;
    $('#study-metric-name').value = config.metric_name;
    $('#study-metric-unit').value = config.metric_unit;
    $('#study-plan-rule').value = config.plan_rule;
    $('#study-rounding-digits').value = String(config.rounding_digits);
    $('#study-week-start').value = config.week_start_day;
    setText($('#study-calculation-rule'), config.calculation_rule);
  }
  const locked = records.length > 0;
  for (const el of setup.querySelectorAll('input, textarea, select, button')) el.disabled = locked;
  setText($('#study-setup-message'), locked ? '첫 기록이 저장되어 1일차 기준이 고정되었습니다.' : (config ? '첫 기록 전까지 기준을 수정할 수 있습니다.' : ''));

  const todayForm = $('#study-today-form');
  const today = summary.next_record_date;
  const hasToday = records.some(r => r.record_date === today);
  const needsChange = Boolean(summary.rule_change_required_before_next_record);
  todayForm.hidden = !config || records.length >= 5 || needsChange;
  const todayButton = todayForm.querySelector('button[type="submit"]');
  if (todayButton) todayButton.disabled = hasToday;
  setText($('#study-today-message'), hasToday ? `${today} 기록이 이미 있어 오늘은 한 건만 유지합니다.` : '');

  const ruleForm = $('#study-rule-form');
  ruleForm.hidden = !config || !needsChange;
  if (!ruleForm.hidden && config) $('#study-new-rule').value = config.plan_rule;

  const root = $('#study-records');
  root.replaceChildren();
  if (!records.length) {
    const p = document.createElement('p'); p.className = 'meta'; p.textContent = '아직 실제 날짜 기록이 없습니다.'; root.append(p);
  } else {
    for (const [index, record] of records.entries()) {
      const item = document.createElement('div'); item.className = 'plan-item';
      const title = document.createElement('strong'); title.textContent = `${index + 1}일차 · ${record.record_date}`;
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = `${config.metric_name}: ${record.metric_value} ${config.metric_unit}${record.note ? ` · ${record.note}` : ''}`;
      item.append(title, meta); root.append(item);
    }
  }
  if (change) {
    const item = document.createElement('div'); item.className = 'revision-item';
    const title = document.createElement('strong'); title.textContent = '계획 규칙 변경 · 2일차 뒤 / 3일차 앞';
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${change.previous_rule} → ${change.new_rule} · 이유: ${change.reason} · 시각 ${formatSeoulDateTime(change.changed_at)} KST`;
    item.append(title, meta); root.append(item);
  }
}

async function loadUsageStudy() {
  try { renderUsageStudy(await api('/api/usage-study', { headers: {} })); }
  catch (error) { if (currentUser) setText($('#study-setup-message'), error.message); }
}

async function saveStudySetup(e) {
  e.preventDefault();
  const msg = $('#study-setup-message'); msg.className = ''; setText(msg, '저장 중…');
  try {
    await api('/api/usage-study/setup', {
      method: 'PUT',
      body: JSON.stringify({
        question: $('#study-question').value,
        metric_name: $('#study-metric-name').value,
        metric_unit: $('#study-metric-unit').value,
        plan_rule: $('#study-plan-rule').value,
        rounding_digits: Number($('#study-rounding-digits').value),
        week_start_day: $('#study-week-start').value
      })
    });
    setText(msg, '1일차 기준을 저장했습니다.'); msg.className = 'ok';
    await loadUsageStudy();
  } catch (error) { setText(msg, error.message); msg.className = 'error'; }
}

async function saveTodayStudy(e) {
  e.preventDefault();
  const msg = $('#study-today-message'); msg.className = ''; setText(msg, '저장 중…');
  try {
    await api('/api/usage-study/today', {
      method: 'POST',
      body: JSON.stringify({ metric_value: Number($('#study-value').value), note: $('#study-note').value })
    });
    $('#study-value').value = '';
    $('#study-note').value = '';
    setText(msg, '오늘 기록을 저장했습니다.'); msg.className = 'ok';
    await loadUsageStudy();
  } catch (error) { setText(msg, error.message); msg.className = 'error'; }
}

async function saveStudyRuleChange(e) {
  e.preventDefault();
  const msg = $('#study-rule-message'); msg.className = ''; setText(msg, '저장 중…');
  try {
    await api('/api/usage-study/rule-change', {
      method: 'POST',
      body: JSON.stringify({ new_rule: $('#study-new-rule').value, reason: $('#study-rule-reason').value })
    });
    setText(msg, '규칙 변경 시각과 1·2일차 참조를 저장했습니다.'); msg.className = 'ok';
    await loadUsageStudy();
  } catch (error) { setText(msg, error.message); msg.className = 'error'; }
}

async function changePasswordSubmit(e) {
  e.preventDefault();
  const msg = $('#password-message'); msg.className = ''; setText(msg, '변경 중…');
  try {
    const data = await api('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: $('#current-password').value, new_password: $('#new-password').value })
    });
    $('#password-form').reset();
    setText(msg, '변경 완료 · 이전 세션은 모두 폐기되고 현재 세션이 새로 발급되었습니다.'); msg.className = 'ok';
    showApp(currentUser, data.session_expires_at);
  } catch (error) { setText(msg, error.message); msg.className = 'error'; }
}

async function deleteAccountSubmit(e) {
  e.preventDefault();
  const msg = $('#delete-message'); msg.className = '';
  if ($('#delete-confirm').value !== 'DELETE') {
    setText(msg, 'DELETE를 정확히 입력해 주세요.'); msg.className = 'error'; return;
  }
  if (!window.confirm('계정과 이 계정의 모든 자료를 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
  setText(msg, '삭제 중…');
  try {
    await api('/api/auth/account', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
    $('#delete-account-form').reset();
    showAuth('계정과 연결된 자료를 삭제했습니다.');
  } catch (error) { setText(msg, error.message); msg.className = 'error'; }
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

$('#login-form').addEventListener('submit', handleLoginSubmit);
$('#register-form').addEventListener('submit', handleRegisterSubmit);
$('#logout-btn').addEventListener('click', logoutNow);
$('#study-setup-form').addEventListener('submit', saveStudySetup);
$('#study-today-form').addEventListener('submit', saveTodayStudy);
$('#study-rule-form').addEventListener('submit', saveStudyRuleChange);
$('#password-form').addEventListener('submit', changePasswordSubmit);
$('#delete-account-form').addEventListener('submit', deleteAccountSubmit);

$('#export-btn').addEventListener('click', exportAllData);
$('#refresh-btn').addEventListener('click', checkHealth);
$('#new-plan-btn').addEventListener('click', resetPlanForm);
$('#new-task-btn').addEventListener('click', openNewTaskForm);
$('#cancel-task-btn').addEventListener('click', closeTaskForm);
for (const id of ['task-search','task-status-filter','task-priority-filter','task-tag-filter','task-sort']) {
  $(id.startsWith('#') ? id : `#${id}`).addEventListener(id === 'task-search' ? 'input' : 'change', renderTasks);
}

bootstrap();
