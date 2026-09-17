const API_BASE = 'https://api.frankfurter.dev/v2/rates';

const SERIES_CONFIG = Object.freeze({
  JPY: {
    label: '일본 엔',
    short: 'JPY',
    base: 'JPY',
    quote: 'KRW',
    multiplier: 100,
    unit: 'KRW / 100 JPY',
    digits: 2,
    contextAmount: 100000,
    contextLabel: '10만 엔'
  },
  CNY: {
    label: '중국 위안',
    short: 'CNY',
    base: 'CNY',
    quote: 'KRW',
    multiplier: 1,
    unit: 'KRW / CNY',
    digits: 2,
    contextAmount: 500,
    contextLabel: '500위안'
  },
  USD: {
    label: '미국 달러',
    short: 'USD',
    base: 'USD',
    quote: 'KRW',
    multiplier: 1,
    unit: 'KRW / USD',
    digits: 2,
    contextAmount: 1000,
    contextLabel: '$1,000'
  }
});

const RANGE_CONFIG = Object.freeze({
  '1m': { label: '1개월', days: 31, group: null },
  '3m': { label: '3개월', days: 93, group: null },
  '1y': { label: '1년', days: 365, group: null },
  '5y': { label: '5년', days: 1827, group: 'week' }
});

let selectedCurrency = 'JPY';
let selectedRange = '1y';
let activeRequest = 0;
const cache = new Map();

function injectStyles() {
  if (document.querySelector('link[data-history-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../history.css?v=16', import.meta.url).href;
  link.dataset.historyStyle = 'true';
  document.head.append(link);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function rangeDates(rangeKey) {
  const cfg = RANGE_CONFIG[rangeKey];
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - cfg.days);
  return { from: isoDate(from), to: isoDate(to) };
}

function buildUrl(currencyKey, rangeKey) {
  const cfg = SERIES_CONFIG[currencyKey];
  const range = RANGE_CONFIG[rangeKey];
  const { from, to } = rangeDates(rangeKey);
  const params = new URLSearchParams({
    base: cfg.base,
    quotes: cfg.quote,
    from,
    to
  });
  if (range.group) params.set('group', range.group);
  return `${API_BASE}?${params.toString()}`;
}

async function fetchSeries(currencyKey, rangeKey) {
  const key = `${currencyKey}:${rangeKey}`;
  if (cache.has(key)) return cache.get(key);

  const url = buildUrl(currencyKey, rangeKey);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) throw new Error(`Frankfurter HTTP ${response.status}`);

  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Frankfurter 응답이 배열이 아닙니다.');

  const cfg = SERIES_CONFIG[currencyKey];
  const normalized = rows
    .filter((row) =>
      row?.base === cfg.base &&
      row?.quote === cfg.quote &&
      typeof row?.date === 'string' &&
      Number.isFinite(Number(row?.rate))
    )
    .map((row) => ({
      date: row.date,
      value: Number(row.rate) * cfg.multiplier
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (normalized.length < 2) throw new Error('그래프를 그릴 만큼 환율 데이터가 충분하지 않습니다.');

  const result = { url, rows: normalized };
  cache.set(key, result);
  return result;
}

function sectionMarkup() {
  const section = document.createElement('section');
  section.id = 'history-section';
  section.setAttribute('aria-labelledby', 'history-title');
  section.innerHTML = `
    <div class="section-head">
      <div>
        <small>HISTORICAL REFERENCE</small>
        <h2 id="history-title">환율 흐름과 현재 위치</h2>
      </div>
      <p>과거 참고 시계열은 Frankfurter 데이터를 사용하며, 상단 실시간 환율 원천과는 별도로 표시합니다.</p>
    </div>

    <div class="history-shell">
      <div class="history-toolbar">
        <div class="history-toggle-group" aria-label="통화 선택">
          ${Object.keys(SERIES_CONFIG).map((key) =>
            `<button type="button" data-history-currency="${key}" class="${key === selectedCurrency ? 'active' : ''}">
              ${SERIES_CONFIG[key].short}
            </button>`
          ).join('')}
        </div>
        <div class="history-toggle-group range" aria-label="기간 선택">
          ${Object.entries(RANGE_CONFIG).map(([key, cfg]) =>
            `<button type="button" data-history-range="${key}" class="${key === selectedRange ? 'active' : ''}">
              ${cfg.label}
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="history-meta-line">
        <div>
          <span id="history-series-label">일본 엔 · 100 JPY → KRW</span>
          <strong id="history-latest-value">불러오는 중…</strong>
        </div>
        <div class="history-source">
          <span>시계열 출처</span>
          <a id="history-source-link" href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">
            Frankfurter
          </a>
        </div>
      </div>

      <div class="history-chart-frame">
        <div id="history-loading" class="history-loading">과거 환율을 불러오는 중입니다.</div>
        <svg id="history-chart" viewBox="0 0 900 310" role="img" aria-labelledby="history-chart-title history-chart-desc" hidden>
          <title id="history-chart-title">선택 기간 환율 그래프</title>
          <desc id="history-chart-desc">Frankfurter의 과거 환율 시계열입니다.</desc>
        </svg>
      </div>

      <div class="history-stats">
        <div>
          <span>기간 최저</span>
          <strong id="history-low">—</strong>
          <small id="history-low-date">—</small>
        </div>
        <div class="focus">
          <span>시계열 최신값</span>
          <strong id="history-current">—</strong>
          <small id="history-current-date">—</small>
        </div>
        <div>
          <span>기간 최고</span>
          <strong id="history-high">—</strong>
          <small id="history-high-date">—</small>
        </div>
        <div>
          <span>기간 범위 내 위치</span>
          <strong id="history-position">—</strong>
          <small>0% = 기간 최저 · 100% = 기간 최고</small>
        </div>
      </div>

      <div class="history-position-track" aria-hidden="true">
        <div class="history-position-fill" id="history-position-fill"></div>
        <div class="history-position-marker" id="history-position-marker"></div>
      </div>

      <div class="history-context">
        <div>
          <span id="history-context-title">10만 엔 환산 비교</span>
          <strong id="history-context-value">—</strong>
        </div>
        <p id="history-context-copy">
          선택 기간의 최저·최신·최고 환율을 같은 금액에 적용해 원화 차이를 보여줍니다.
        </p>
      </div>

      <div class="history-notice" id="history-notice">
        <strong>해석 기준</strong>
        <span>“기간 최저·최고·위치”는 선택한 기간의 Frankfurter 시계열 안에서만 계산합니다. 환전·투자 판단을 권하지 않습니다.</span>
      </div>
    </div>
  `;
  return section;
}

function insertSection() {
  if (document.querySelector('#history-section')) return;

  const section = sectionMarkup();
  const replay = document.querySelector('#synthetic-replay');
  if (replay) replay.before(section);
  else {
    const liveRecords = document.querySelector('#preserved-live-records');
    if (liveRecords) liveRecords.before(section);
    else document.querySelector('footer')?.before(section);
  }
}

function fmt(value, digits) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function fmtWon(value) {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)}원`;
}

function niceRange(min, max) {
  if (min === max) return { min: min - 1, max: max + 1 };
  const pad = (max - min) * 0.10;
  return { min: min - pad, max: max + pad };
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function drawChart(rows, cfg) {
  const svg = document.querySelector('#history-chart');
  svg.innerHTML = `
    <title id="history-chart-title">${cfg.label} 환율 그래프</title>
    <desc id="history-chart-desc">Frankfurter 과거 환율 ${rows.length}개 지점을 연결한 선 그래프입니다.</desc>
  `;

  const W = 900, H = 310;
  const margin = { left: 62, right: 20, top: 22, bottom: 42 };
  const plotW = W - margin.left - margin.right;
  const plotH = H - margin.top - margin.bottom;
  const values = rows.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const yRange = niceRange(rawMin, rawMax);

  const x = (index) =>
    margin.left + (index / Math.max(1, rows.length - 1)) * plotW;
  const y = (value) =>
    margin.top + ((yRange.max - value) / (yRange.max - yRange.min)) * plotH;

  for (let i = 0; i <= 4; i += 1) {
    const yy = margin.top + (plotH / 4) * i;
    const val = yRange.max - ((yRange.max - yRange.min) / 4) * i;

    svg.append(svgEl('line', {
      x1: margin.left, y1: yy, x2: W - margin.right, y2: yy,
      class: 'history-grid-line'
    }));

    const label = svgEl('text', {
      x: margin.left - 10, y: yy + 4,
      'text-anchor': 'end',
      class: 'history-axis-label'
    });
    label.textContent = fmt(val, cfg.digits);
    svg.append(label);
  }

  const tickIndices = Array.from(new Set([
    0,
    Math.floor((rows.length - 1) * 0.25),
    Math.floor((rows.length - 1) * 0.5),
    Math.floor((rows.length - 1) * 0.75),
    rows.length - 1
  ]));

  for (const index of tickIndices) {
    const label = svgEl('text', {
      x: x(index), y: H - 13,
      'text-anchor': index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle',
      class: 'history-axis-label'
    });
    label.textContent = rows[index].date;
    svg.append(label);
  }

  const points = rows.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
  svg.append(svgEl('polyline', {
    points,
    class: 'history-line'
  }));

  const latest = rows.at(-1);
  svg.append(svgEl('circle', {
    cx: x(rows.length - 1),
    cy: y(latest.value),
    r: 5,
    class: 'history-latest-dot'
  }));

  svg.hidden = false;
}

function stats(rows, cfg) {
  let low = rows[0];
  let high = rows[0];

  for (const point of rows) {
    if (point.value < low.value) low = point;
    if (point.value > high.value) high = point;
  }

  const current = rows.at(-1);
  const span = high.value - low.value;
  const position = span === 0 ? 50 : ((current.value - low.value) / span) * 100;

  return { low, high, current, position: Math.max(0, Math.min(100, position)) };
}

function contextAmountWon(rate, cfg) {
  if (cfg.short === 'JPY') {
    return (cfg.contextAmount / 100) * rate;
  }
  return cfg.contextAmount * rate;
}

function renderStats(rows, cfg, rangeCfg) {
  const s = stats(rows, cfg);
  const unit = cfg.unit;

  document.querySelector('#history-series-label').textContent =
    `${cfg.label} · ${unit}`;
  document.querySelector('#history-latest-value').textContent =
    `${fmt(s.current.value, cfg.digits)} ${unit}`;

  document.querySelector('#history-low').textContent =
    fmt(s.low.value, cfg.digits);
  document.querySelector('#history-low-date').textContent = s.low.date;

  document.querySelector('#history-current').textContent =
    fmt(s.current.value, cfg.digits);
  document.querySelector('#history-current-date').textContent = s.current.date;

  document.querySelector('#history-high').textContent =
    fmt(s.high.value, cfg.digits);
  document.querySelector('#history-high-date').textContent = s.high.date;

  document.querySelector('#history-position').textContent =
    `${s.position.toFixed(1)}%`;

  document.querySelector('#history-position-fill').style.width =
    `${s.position}%`;
  document.querySelector('#history-position-marker').style.left =
    `${s.position}%`;

  const lowCost = contextAmountWon(s.low.value, cfg);
  const currentCost = contextAmountWon(s.current.value, cfg);
  const highCost = contextAmountWon(s.high.value, cfg);

  document.querySelector('#history-context-title').textContent =
    `${cfg.contextLabel} 환산 비교`;

  document.querySelector('#history-context-value').textContent =
    `최저 ${fmtWon(lowCost)} · 최신 ${fmtWon(currentCost)} · 최고 ${fmtWon(highCost)}`;

  document.querySelector('#history-context-copy').textContent =
    `${rangeCfg.label} Frankfurter 시계열의 동일 금액 단순 환산입니다. 카드사·플랫폼·환전 수수료 등은 포함하지 않습니다.`;
}

function setLoading(message = '과거 환율을 불러오는 중입니다.') {
  const loading = document.querySelector('#history-loading');
  loading.hidden = false;
  loading.className = 'history-loading';
  loading.textContent = message;
  document.querySelector('#history-chart').hidden = true;
}

function setError(message) {
  const loading = document.querySelector('#history-loading');
  loading.hidden = false;
  loading.className = 'history-loading error';
  loading.textContent = `${message} 기간이나 통화를 바꾸거나 잠시 뒤 다시 시도해 주세요.`;
  document.querySelector('#history-chart').hidden = true;
}

function setActiveButtons() {
  document.querySelectorAll('[data-history-currency]').forEach((button) => {
    button.classList.toggle('active', button.dataset.historyCurrency === selectedCurrency);
  });
  document.querySelectorAll('[data-history-range]').forEach((button) => {
    button.classList.toggle('active', button.dataset.historyRange === selectedRange);
  });
}

async function renderHistory() {
  const requestId = ++activeRequest;
  setActiveButtons();
  setLoading();

  try {
    const result = await fetchSeries(selectedCurrency, selectedRange);
    if (requestId !== activeRequest) return;

    const cfg = SERIES_CONFIG[selectedCurrency];
    const rangeCfg = RANGE_CONFIG[selectedRange];

    drawChart(result.rows, cfg);
    renderStats(result.rows, cfg, rangeCfg);

    const sourceLink = document.querySelector('#history-source-link');
    sourceLink.href = result.url;
    sourceLink.textContent = 'Frankfurter 원자료';

    document.querySelector('#history-loading').hidden = true;
  } catch (error) {
    if (requestId !== activeRequest) return;
    console.error('Historical exchange-rate load failed:', error);
    setError(error?.message || '과거 환율을 가져오지 못했습니다.');
  }
}

function wire() {
  document.querySelectorAll('[data-history-currency]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedCurrency = button.dataset.historyCurrency;
      renderHistory();
    });
  });

  document.querySelectorAll('[data-history-range]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRange = button.dataset.historyRange;
      renderHistory();
    });
  });
}

export function setupHistoryChart() {
  injectStyles();
  insertSection();
  wire();
  renderHistory();
}
