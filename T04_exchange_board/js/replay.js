import {
  resetEvaluationState,
  runFixture,
  lastGoodValue,
  verifyAgainstExpected
} from './replay-core.js';

const STORAGE_KEY = 'aleph-t04-synthetic-replay-v1';

const FIXTURE_FILES = Object.freeze({
  'T04-NORMAL-D1-A': 'normal-d1-a.json',
  'T04-NORMAL-D1-B': 'normal-d1-b.json',
  'T04-NORMAL-D2': 'normal-d2.json',
  'T04-TIMEOUT': 'timeout.json',
  'T04-AUTH-401': 'auth-401.json',
  'T04-RATE-429': 'rate-429.json',
  'T04-OFFLINE': 'offline.json',
  'T04-SCHEMA-BREAK': 'schema-break.json',
  'T04-RECOVER-D2': 'recover-d2.json'
});

const FAILURE_IDS = Object.freeze([
  'T04-TIMEOUT',
  'T04-AUTH-401',
  'T04-RATE-429',
  'T04-OFFLINE',
  'T04-SCHEMA-BREAK'
]);

const FAILURE_LABELS = Object.freeze({
  'T04-TIMEOUT': '느린 응답 · timeout',
  'T04-AUTH-401': '원천 거절 · 401',
  'T04-RATE-429': '호출 제한 · 429',
  'T04-OFFLINE': '오프라인',
  'T04-SCHEMA-BREAK': '응답 형식 변경'
});

let fixtureCache = new Map();
let state = loadState();
let lastVerification = null;
let packageMeta = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return resetEvaluationState();
    const parsed = JSON.parse(raw);
    return parsed?.schema_version === 'aleph-t04-evaluation-state-v1'
      ? parsed
      : resetEvaluationState();
  } catch {
    return resetEvaluationState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`fixture load failed: HTTP ${response.status}`);
  return response.json();
}

async function fixture(fixtureId) {
  if (fixtureCache.has(fixtureId)) return fixtureCache.get(fixtureId);

  const filename = FIXTURE_FILES[fixtureId];
  if (!filename) throw new Error(`unknown fixture: ${fixtureId}`);

  const data = await fetchJson(new URL(`../fixtures/${filename}`, import.meta.url));
  fixtureCache.set(fixtureId, data);
  return data;
}

async function loadPackageMeta() {
  const [contract, manifest] = await Promise.all([
    fetchJson(new URL('../public-contract.json', import.meta.url)),
    fetchJson(new URL('../fixture-manifest.json', import.meta.url))
  ]);

  packageMeta = { contract, manifest };
}

function injectStyles() {
  if (document.querySelector('link[data-t04-replay-style]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../replay.css?v=15', import.meta.url).href;
  link.dataset.t04ReplayStyle = 'true';
  document.head.append(link);
}

function markup() {
  const section = document.createElement('section');
  section.id = 'synthetic-replay';
  section.setAttribute('aria-labelledby', 'replay-title');

  section.innerHTML = `
    <div class="section-head">
      <div>
        <small>DETERMINISTIC REPLAY</small>
        <h2 id="replay-title">외부 실패 합성 재생</h2>
      </div>
      <p>공식 T04 fixture만 사용합니다. 실제 환율과 실제 일별 기록에는 영향을 주지 않습니다.</p>
    </div>

    <div class="replay-wrap">
      <div class="replay-package">
        <div>
          <span>PUBLIC PACKAGE</span>
          <strong id="replay-package-id">불러오는 중…</strong>
        </div>
        <div>
          <span>FIXTURE CONTRACT</span>
          <strong id="replay-contract-version">—</strong>
        </div>
        <div>
          <span>OFFICIAL FIXTURES</span>
          <strong id="replay-fixture-count">9</strong>
        </div>
      </div>

      <div class="replay-layout">
        <div class="replay-controls">
          <div class="replay-block">
            <div class="replay-block-head">
              <div>
                <span class="replay-step">01</span>
                <h3>정상 저장 흐름</h3>
              </div>
              <button type="button" class="replay-reset" id="replay-reset">합성 상태 초기화</button>
            </div>
            <p>같은 KST 날짜는 한 행을 갱신하고 다음 날짜에만 새 행을 만듭니다.</p>
            <div class="replay-buttons normal-buttons">
              <button type="button" data-fixture="T04-NORMAL-D1-A">D1-A · 100</button>
              <button type="button" data-fixture="T04-NORMAL-D1-B">D1-B · 105</button>
              <button type="button" data-fixture="T04-NORMAL-D2">D2 · 120</button>
            </div>
            <button type="button" class="replay-sequence" id="replay-normal-sequence">
              정상 시퀀스 전체 재생
            </button>
          </div>

          <div class="replay-block">
            <div class="replay-block-head">
              <div>
                <span class="replay-step">02</span>
                <h3>다섯 가지 외부 실패</h3>
              </div>
            </div>
            <p>각 버튼은 자동으로 reset → D1-A → D1-B → 선택한 실패 fixture를 실행합니다.</p>
            <div class="failure-buttons" id="failure-buttons"></div>
          </div>

          <div class="replay-block recovery-block">
            <div class="replay-block-head">
              <div>
                <span class="replay-step">03</span>
                <h3>오류 뒤 복구</h3>
              </div>
            </div>
            <p>실패 상태에서는 마지막 정상값을 유지하고, 다시 시도하면 공개 asset T04-RECOVER-D2를 재생합니다.</p>
            <button type="button" class="retry-button" id="replay-retry" hidden>
              다시 시도 · T04-RECOVER-D2
            </button>
          </div>
        </div>

        <div class="replay-observer">
          <div class="replay-status-head">
            <div>
              <span>현재 합성 상태</span>
              <strong id="replay-status-label">초기 상태</strong>
            </div>
            <span class="stale-badge" id="replay-stale-badge" hidden>오래된 값 · STALE</span>
          </div>

          <div class="replay-metrics">
            <div><span>freshness</span><strong id="replay-freshness">—</strong></div>
            <div><span>error_code</span><strong id="replay-error-code">—</strong></div>
            <div><span>일별 행</span><strong id="replay-row-count">0</strong></div>
            <div><span>마지막 정상값</span><strong id="replay-last-good">—</strong></div>
            <div><span>전일 대비</span><strong id="replay-delta">—</strong></div>
            <div><span>마지막 fixture</span><strong id="replay-last-fixture">—</strong></div>
          </div>

          <div class="expected-box" id="replay-expected">
            fixture를 실행하면 공식 expected 값과 현재 상태를 자동 대조합니다.
          </div>

          <div class="replay-table-wrap">
            <table class="replay-table">
              <thead>
                <tr>
                  <th>record_id</th>
                  <th>KST 날짜</th>
                  <th>저장값</th>
                  <th>단위</th>
                  <th>마지막 조회</th>
                </tr>
              </thead>
              <tbody id="replay-rows">
                <tr><td colspan="5">합성 일별 기록이 없습니다.</td></tr>
              </tbody>
            </table>
          </div>

          <div class="replay-note">
            <strong>실제 데이터와 분리</strong>
            <span>이 영역의 reset은 브라우저의 합성 평가 상태만 초기화합니다. 실제 JPY 환율과 실제 이틀 증거는 삭제하지 않습니다.</span>
          </div>
        </div>
      </div>
    </div>
  `;

  return section;
}

function insertSection() {
  if (document.querySelector('#synthetic-replay')) return;

  const section = markup();
  const recordSection = document.querySelector('#record-title')?.closest('section');

  if (recordSection) recordSection.before(section);
  else document.querySelector('footer')?.before(section);
}

function failureButtons() {
  const container = document.querySelector('#failure-buttons');

  for (const id of FAILURE_IDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.failureFixture = id;
    button.textContent = FAILURE_LABELS[id];
    container.append(button);
  }
}

function formatDelta() {
  if (state.last_comparison?.state !== 'comparable') return '—';

  const sign =
    state.last_comparison.direction === 'increase'
      ? '+'
      : state.last_comparison.direction === 'decrease'
        ? '−'
        : '';

  return `${sign}${state.last_comparison.magnitude} ${state.last_comparison.unit}`;
}

function renderExpected() {
  const box = document.querySelector('#replay-expected');

  if (!lastVerification) {
    box.className = 'expected-box';
    box.textContent = 'fixture를 실행하면 공식 expected 값과 현재 상태를 자동 대조합니다.';
    return;
  }

  box.className = `expected-box ${lastVerification.pass ? 'pass' : 'fail'}`;

  const summary = lastVerification.results
    .map((item) =>
      `${item.pass ? '✓' : '✕'} ${item.field}: ${String(item.actual)} / expected ${String(item.expected)}`
    )
    .join(' · ');

  box.textContent = `${lastVerification.pass ? 'EXPECTED PASS' : 'EXPECTED FAIL'} · ${summary}`;
}

function renderRows() {
  const tbody = document.querySelector('#replay-rows');

  if (!state.daily_readings.length) {
    tbody.innerHTML = '<tr><td colspan="5">합성 일별 기록이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const row of state.daily_readings) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${row.record_id}</code></td>
      <td>${row.record_date}</td>
      <td><strong>${row.normalized_value}</strong></td>
      <td>${row.unit}</td>
      <td>${row.last_fetched_at}</td>
    `;
    tbody.append(tr);
  }
}

function render() {
  const stale = state.status?.freshness === 'stale';

  document.querySelector('#replay-freshness').textContent = state.status?.freshness ?? '—';
  document.querySelector('#replay-error-code').textContent = state.status?.error_code ?? '—';
  document.querySelector('#replay-row-count').textContent = String(state.daily_readings.length);
  document.querySelector('#replay-last-good').textContent =
    lastGoodValue(state) === null ? '—' : String(lastGoodValue(state));
  document.querySelector('#replay-delta').textContent = formatDelta();
  document.querySelector('#replay-last-fixture').textContent = state.last_run?.fixture_id ?? '—';

  document.querySelector('#replay-status-label').textContent =
    !state.status
      ? '초기 상태'
      : stale
        ? '실패 · 마지막 정상값 보존'
        : '정상 · FRESH';

  document.querySelector('#replay-stale-badge').hidden = !stale;
  document.querySelector('#replay-retry').hidden = !stale;

  renderRows();
  renderExpected();
}

async function runOne(fixtureId) {
  const data = await fixture(fixtureId);
  state = runFixture(state, data);
  lastVerification = verifyAgainstExpected(state, data);
  saveState();
  render();
}

async function runNormalSequence() {
  state = resetEvaluationState();
  lastVerification = null;

  for (const fixtureId of ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', 'T04-NORMAL-D2']) {
    const data = await fixture(fixtureId);
    state = runFixture(state, data);
    lastVerification = verifyAgainstExpected(state, data);
  }

  saveState();
  render();
}

async function runFailureSequence(fixtureId) {
  state = resetEvaluationState();

  for (const id of ['T04-NORMAL-D1-A', 'T04-NORMAL-D1-B', fixtureId]) {
    const data = await fixture(id);
    state = runFixture(state, data);
    lastVerification = verifyAgainstExpected(state, data);
  }

  saveState();
  render();
}

async function recover() {
  const data = await fixture('T04-RECOVER-D2');
  state = runFixture(state, data);
  lastVerification = verifyAgainstExpected(state, data);
  saveState();
  render();
}

function reset() {
  state = resetEvaluationState();
  lastVerification = null;
  localStorage.removeItem(STORAGE_KEY);
  render();
}

function wireEvents() {
  document.querySelector('#replay-reset').addEventListener('click', reset);
  document.querySelector('#replay-normal-sequence').addEventListener('click', runNormalSequence);
  document.querySelector('#replay-retry').addEventListener('click', recover);

  document.querySelectorAll('[data-fixture]').forEach((button) => {
    button.addEventListener('click', () => runOne(button.dataset.fixture));
  });

  document.querySelectorAll('[data-failure-fixture]').forEach((button) => {
    button.addEventListener('click', () => runFailureSequence(button.dataset.failureFixture));
  });
}

function renderPackageMeta() {
  if (!packageMeta) return;

  document.querySelector('#replay-package-id').textContent =
    packageMeta.contract.package_id ?? '—';

  document.querySelector('#replay-contract-version').textContent =
    packageMeta.contract.fixture_contract?.version ?? '—';

  document.querySelector('#replay-fixture-count').textContent =
    String(packageMeta.manifest.fixtures?.length ?? 0);
}

export async function setupSyntheticReplay() {
  injectStyles();
  insertSection();
  failureButtons();
  wireEvents();
  render();

  try {
    await loadPackageMeta();
    renderPackageMeta();
  } catch (error) {
    console.error('T04 public package metadata load failed:', error);
    document.querySelector('#replay-package-id').textContent = '공개 package 정보 로드 실패';
  }
}
