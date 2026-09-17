import { setupCalculators } from './calculators.js';

const LIVE_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';
const SNAPSHOT_URL = './data/current-rates.json';
const DIRECT_TIMEOUT_MS = 8000;

const els = {
  status: document.querySelector('#status'), statusText: document.querySelector('#status-text'),
  jpy: document.querySelector('#jpy-value'), cny: document.querySelector('#cny-value'), usd: document.querySelector('#usd-value'),
  jpyContext: document.querySelector('#jpy-context'), cnyContext: document.querySelector('#cny-context'), usdContext: document.querySelector('#usd-context'),
  sourceObservedAt: document.querySelector('#source-observed-at'), fetchedAt: document.querySelector('#fetched-at'), timezone: document.querySelector('#timezone'), sourceLink: document.querySelector('#source-link'),
  rawKrw: document.querySelector('#raw-krw'), rawJpy: document.querySelector('#raw-jpy'), rawCny: document.querySelector('#raw-cny'), normalizedJpy: document.querySelector('#normalized-jpy'),
  refresh: document.querySelector('#refresh-button'), errorBox: document.querySelector('#error-box'), lastUpdated: document.querySelector('#last-updated'), fetchMode: document.querySelector('#fetch-mode'),
  makeRecord: document.querySelector('#make-record'), downloadRecord: document.querySelector('#download-record'), recordJson: document.querySelector('#record-json')
};

let latestData = null;
let generatedRecord = null;

const kstDateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
});
const won0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits:0 });

function formatKst(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? `${kstDateTime.format(date)} KST` : '—';
}
function formatNumber(value, digits=2) {
  return new Intl.NumberFormat('ko-KR', { minimumFractionDigits:digits, maximumFractionDigits:digits }).format(value);
}
function setLoading(value) {
  els.refresh.disabled = value;
  els.refresh.textContent = value ? '조회 중…' : '↻ 최신 환율 다시 조회';
}
function setMessage(state, text, detail='', kind='') {
  els.status.dataset.state = state;
  els.statusText.textContent = text;
  if (detail) {
    els.errorBox.hidden = false;
    els.errorBox.dataset.kind = kind;
    els.errorBox.textContent = detail;
  } else {
    els.errorBox.hidden = true;
    els.errorBox.dataset.kind = '';
    els.errorBox.textContent = '';
  }
}

function validateRaw(raw) {
  if (!raw || raw.result !== 'success' || raw.base_code !== 'USD') throw new Error('환율 원천의 응답 상태가 예상과 다릅니다.');
  for (const code of ['KRW','JPY','CNY']) {
    if (!Number.isFinite(Number(raw.rates?.[code])) || Number(raw.rates[code]) <= 0) {
      throw new Error(`${code} 환율 값이 없거나 형식이 올바르지 않습니다.`);
    }
  }
}

function normalize(raw, fetchedAt, mode, sourceUrl=LIVE_SOURCE_URL) {
  validateRaw(raw);
  const krw = Number(raw.rates.KRW);
  const jpy = Number(raw.rates.JPY);
  const cny = Number(raw.rates.CNY);
  const sourceObservedAt = raw.time_last_update_unix
    ? new Date(Number(raw.time_last_update_unix) * 1000)
    : new Date(raw.time_last_update_utc);
  if (Number.isNaN(sourceObservedAt.getTime())) throw new Error('원천 기준 시각을 해석할 수 없습니다.');
  return {
    mode,
    sourceUrl,
    sourceObservedAt,
    fetchedAt,
    raw,
    normalized: {
      usdKrw: krw,
      cnyKrw: krw / cny,
      jpy100Krw: (krw / jpy) * 100
    }
  };
}

async function fetchJson(url, timeoutMs=DIRECT_TIMEOUT_MS, options={}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache:'no-store', ...options, signal:controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${Math.round(timeoutMs/1000)}초 안에 응답이 오지 않았습니다.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function loadSnapshot() {
  const snap = await fetchJson(`${SNAPSHOT_URL}?t=${Date.now()}`, 5000);
  if (!snap?.raw || !snap?.fetched_at) throw new Error('저장 환율 파일 형식이 올바르지 않습니다.');
  return normalize(snap.raw, new Date(snap.fetched_at), 'github-snapshot', snap.source_url || LIVE_SOURCE_URL);
}

async function loadDirect() {
  const raw = await fetchJson(`${LIVE_SOURCE_URL}?t=${Date.now()}`, DIRECT_TIMEOUT_MS, { mode:'cors' });
  return normalize(raw, new Date(), 'live-direct', LIVE_SOURCE_URL);
}

const renderCalculators = setupCalculators(() => latestData?.normalized ?? null);

function render(data) {
  latestData = data;
  const { normalized, raw } = data;
  els.jpy.textContent = `₩${formatNumber(normalized.jpy100Krw)}`;
  els.cny.textContent = `₩${formatNumber(normalized.cnyKrw)}`;
  els.usd.textContent = `₩${formatNumber(normalized.usdKrw)}`;
  els.jpyContext.textContent = `약 ${won0.format((50000 / 100) * normalized.jpy100Krw)}원`;
  els.cnyContext.textContent = `약 ${won0.format(299 * normalized.cnyKrw)}원`;
  els.usdContext.textContent = `약 ${won0.format(1000 * normalized.usdKrw)}원`;
  els.sourceObservedAt.textContent = formatKst(data.sourceObservedAt);
  els.fetchedAt.textContent = formatKst(data.fetchedAt);
  els.lastUpdated.textContent = formatKst(data.fetchedAt);
  els.timezone.textContent = 'Asia/Seoul (KST)';
  els.rawKrw.textContent = raw.rates.KRW;
  els.rawJpy.textContent = raw.rates.JPY;
  els.rawCny.textContent = raw.rates.CNY;
  els.normalizedJpy.textContent = `${formatNumber(normalized.jpy100Krw, 4)} KRW / 100 JPY`;
  els.sourceLink.href = data.sourceUrl;
  els.sourceLink.textContent = 'ExchangeRate-API 원자료';
  renderCalculators();
}

async function loadRates() {
  setLoading(true);
  let snapshot = null;
  let snapshotError = null;

  // 1) 같은 origin의 마지막 정상 스냅샷을 먼저 표시해 빈 화면을 피한다.
  try {
    snapshot = await loadSnapshot();
    render(snapshot);
    els.fetchMode.textContent = 'GitHub Pages 저장본 · 최신 원천 확인 중';
    setMessage('stale', '마지막 정상 환율을 먼저 표시했습니다. 최신 공개 원천을 확인 중입니다.');
  } catch (error) {
    snapshotError = error;
    console.warn('snapshot load failed:', error);
  }

  // 2) 공개 원천을 직접 조회한다. 실패하면 기존 snapshot을 보존한다.
  try {
    const direct = await loadDirect();
    render(direct);
    els.fetchMode.textContent = '브라우저 → 공개 원천 직접 조회';
    setMessage('fresh', '최신 공개 환율 직접 조회 성공');
  } catch (error) {
    console.warn('direct rate fetch failed:', error);
    if (snapshot) {
      els.fetchMode.textContent = 'GitHub Pages 마지막 정상 저장본';
      setMessage(
        'stale',
        '최신 공개 원천 조회 실패 · 마지막 정상 환율 표시 중',
        `최신 원천을 직접 가져오지 못했습니다 (${error?.message || '알 수 없는 오류'}). 마지막 정상값은 지우지 않았습니다. 원천 기준 시각과 수집 시각을 확인한 뒤 다시 시도할 수 있습니다.`,
        'stale'
      );
    } else {
      setMessage(
        'error',
        '환율을 불러오지 못했습니다',
        `공개 원천과 저장 환율을 모두 불러오지 못했습니다. 직접 조회 오류: ${error?.message || '알 수 없음'} / 저장본 오류: ${snapshotError?.message || '알 수 없음'}`
      );
      els.fetchMode.textContent = '조회 실패';
    }
  } finally {
    setLoading(false);
  }
}

function kstDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function makeRecord() {
  if (!latestData) {
    els.recordJson.textContent = '먼저 실제 환율 또는 마지막 정상 저장 환율을 불러와야 합니다.';
    return;
  }
  generatedRecord = {
    signal_id:'jpy-100-krw',
    record_date:kstDateKey(latestData.fetchedAt),
    source_url:latestData.sourceUrl,
    source_observed_at:latestData.sourceObservedAt.toISOString(),
    normalized_value:Number(latestData.normalized.jpy100Krw.toFixed(4)),
    unit:'KRW/100JPY',
    fetched_at:latestData.fetchedAt.toISOString(),
    fetch_mode:latestData.mode,
    raw_krw:latestData.raw.rates.KRW,
    raw_jpy:latestData.raw.rates.JPY
  };
  els.recordJson.textContent = JSON.stringify(generatedRecord, null, 2);
  els.downloadRecord.disabled = false;
}

function downloadRecord() {
  if (!generatedRecord) return;
  const blob = new Blob([`${JSON.stringify(generatedRecord, null, 2)}\n`], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `t04-day-${generatedRecord.record_date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

els.sourceLink.href = LIVE_SOURCE_URL;
els.refresh.addEventListener('click', loadRates);
els.makeRecord.addEventListener('click', makeRecord);
els.downloadRecord.addEventListener('click', downloadRecord);
loadRates();
