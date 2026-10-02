const $ = (s) => document.querySelector(s);
let selectedPlanId = null;

const priorityLabel = { high: '높음', medium: '중간', low: '낮음' };

function setText(el, value) { el.textContent = value ?? ''; }
function escDate(v) { return v || '-'; }

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
  } catch (e) {
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

function resetForm() {
  selectedPlanId = null;
  $('#plan-form').reset();
  $('#plan-id').value = '';
  $('#priority').value = 'high';
  setText($('#save-plan-btn'), '계획 저장');
  setText($('#form-message'), '');
  setText($('#revision-list'), '계획을 선택하면 표시됩니다.');
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
  const { plan, revisions } = await api(`/api/plans/${id}`, { headers: {} });
  selectedPlanId = id;
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

$('#refresh-btn').addEventListener('click', checkHealth);
$('#new-plan-btn').addEventListener('click', resetForm);

checkHealth();
loadPlans();
