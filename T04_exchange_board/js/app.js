import { setupCalculators } from './calculators.js';
import { setupSyntheticReplay } from './replay.js';
import { setupLiveRecords } from './live-records.js';
import { setupHistoryChart } from './history.js';

const LIVE_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';
const SNAPSHOT_URL = new URL('../data/current-rates.json', import.meta.url);
const REQUEST_TIMEOUT_MS = 8000;

const els = {
  status: document.querySelector('#status'),
  statusText: document.querySelector('#status-text'),
  jpy: document.querySelector('#jpy-value'),
  cny: document.querySelector('#cny-value'),
  usd: document.querySelector('#usd-value'),
  jpyContext: document.querySelector('#jpy-context'),
  cnyContext: document.querySelector('#cny-context'),
  usdContext: document.querySelector('#usd-context'),
  sourceObservedAt: document.querySelector('#source-observed-at'),
  fetchedAt: document.querySelector('#fetched-at'),
  timezone: document.querySelector('#timezone'),
  sourceLink: document.querySelector('#source-link'),
  rawKrw: document.querySelector('#raw-krw'),
  rawJpy: document.querySelector('#raw-jpy'),
  rawCny: document.querySelector('#raw-cny'),
  normalizedJpy: document.querySelector('#normalized-jpy'),
  refresh: document.querySelector('#refresh-button'),
  errorBox: document.querySelector('#error-box'),
  lastUpdated: document.querySelector('#last-updated'),
  fetchMode: document.querySelector('#fetch-mode'),
  makeRecord: document.querySelector('#make-record'),
  downloadRecord: document.querySelector('#download-record'),
  recordJson: document.querySelector('#record-json')
};

let latestData = null;
let generatedRecord = null;

const kstDateTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const won0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

function formatKst(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? `${kstDateTime.format(date)} KST`
    : '—';
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function setLoading(value) {
  els.refresh.disabled = value;
  els.refresh.textContent = value ? '조회 중…' : '↻ 최신 환율 다시 조회';
}

function normalizeFromRaw(raw, meta = {}) {
  if (raw?.result !== 'success' || raw?.base_code !== 'USD') {
    throw new Error('공개 환율 응답 형식이 예상과 다릅니다.');
  }

  const usdKrw = Number(raw?.rates?.KRW);
  const jpyPerUsd = Number(raw?.rates?.JPY);
  const cnyPerUsd = Number(raw?.rates?.CNY);

  for (const [label, value] of [
    ['KRW', usdKrw],
    ['JPY', jpyPerUsd],
    ['CNY', cnyPerUsd]
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} 환율 값이 올바르지 않습니다.`);
    }
  }

  const sourceObservedAt =
    meta.sourceObservedAt ??
    new Date(Number(raw.time_last_update_unix) * 1000);

  const fetchedAt = meta.fetchedAt ?? new Date();

  if (!(sourceObservedAt instanceof Date) || Number.isNaN(sourceObservedAt.getTime())) {
    throw new Error('원천 기준 시각을 확인할 수 없습니다.');
  }

  if (!(fetchedAt instanceof Date) || Number.isNaN(fetchedAt.getTime())) {
    throw new Error('조회 시각을 확인할 수 없습니다.');
  }

  return {
    raw,
    normalized: {
      usdKrw,
      jpy100Krw: (usdKrw / jpyPerUsd) * 100,
      cnyKrw: usdKrw / cnyPerUsd
    },
    sourceObservedAt,
    fetchedAt,
    sourceUrl: meta.sourceUrl ?? LIVE_SOURCE_URL,
    mode: meta.mode ?? 'live'
  };
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`공개 환율 서버가 ${Math.round(timeoutMs / 1000)}초 안에 응답하지 않았습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveRates() {
  const raw = await fetchJsonWithTimeout(LIVE_SOURCE_URL, REQUEST_TIMEOUT_MS);
  return normalizeFromRaw(raw, {
    sourceUrl: LIVE_SOURCE_URL,
    fetchedAt: new Date(),
    mode: 'live'
  });
}

async function fetchSnapshot() {
  const snapshot = await fetchJsonWithTimeout(SNAPSHOT_URL, 4000);

  if (!snapshot?.raw) {
    throw new Error('저장 환율 파일의 형식이 올바르지 않습니다.');
  }

  return normalizeFromRaw(snapshot.raw, {
    sourceUrl: snapshot.source_url || LIVE_SOURCE_URL,
    sourceObservedAt: new Date(snapshot.source_observed_at),
    fetchedAt: new Date(snapshot.fetched_at),
    mode: 'github-snapshot'
  });
}

const renderCalculators = setupCalculators(() => latestData?.normalized ?? null);

function render(data) {
  latestData = data;
  const { normalized, raw } = data;

  els.jpy.textContent = `₩${formatNumber(normalized.jpy100Krw)}`;
  els.cny.textContent = `₩${formatNumber(normalized.cnyKrw)}`;
  els.usd.textContent = `₩${formatNumber(normalized.usdKrw)}`;

  els.jpyContext.textContent =
    `약 ${won0.format((50000 / 100) * normalized.jpy100Krw)}원`;
  els.cnyContext.textContent =
    `약 ${won0.format(299 * normalized.cnyKrw)}원`;
  els.usdContext.textContent =
    `약 ${won0.format(1000 * normalized.usdKrw)}원`;

  els.sourceObservedAt.textContent = formatKst(data.sourceObservedAt);
  els.fetchedAt.textContent = formatKst(data.fetchedAt);
  els.lastUpdated.textContent = formatKst(data.fetchedAt);
  els.timezone.textContent = 'Asia/Seoul (KST)';

  els.rawKrw.textContent = raw.rates.KRW;
  els.rawJpy.textContent = raw.rates.JPY;
  els.rawCny.textContent = raw.rates.CNY;
  els.normalizedJpy.textContent =
    `${formatNumber(normalized.jpy100Krw, 4)} KRW / 100 JPY`;

  els.sourceLink.href = data.sourceUrl;
  els.sourceLink.textContent = 'ExchangeRate-API 원자료';

  renderCalculators();
}

function showFreshState() {
  els.status.dataset.state = 'fresh';
  els.statusText.textContent = '최신 공개 환율 직접 조회 성공';
  els.fetchMode.textContent = '브라우저 → 공개 원천 직접 조회';
  els.errorBox.hidden = true;
}

function showSnapshotWhileChecking() {
  els.status.dataset.state = 'loading';
  els.statusText.textContent = '마지막 정상 환율을 먼저 표시했습니다. 최신 공개 원천을 확인 중입니다.';
  els.fetchMode.textContent = 'GitHub Actions 저장본 → 공개 원천 확인 중';
  els.errorBox.hidden = true;
}

function showStaleState(message) {
  els.status.dataset.state = 'stale';
  els.statusText.textContent = '최신 공개 원천 조회 실패 · 마지막 정상 환율 표시 중';
  els.fetchMode.textContent = 'GitHub Actions 저장본 또는 마지막 정상 조회값';
  els.errorBox.hidden = false;
  els.errorBox.textContent =
    `${message} 현재 표시값은 마지막으로 정상 확인된 환율이며 최신값이 아닐 수 있습니다.`;
}

function showFatalState(message) {
  els.status.dataset.state = 'error';
  els.statusText.textContent = '현재 환율을 불러오지 못했습니다.';
  els.fetchMode.textContent = '공개 원천·저장 환율 모두 사용 불가';
  els.errorBox.hidden = false;
  els.errorBox.textContent =
    `${message} 잠시 뒤 ‘최신 환율 다시 조회’를 눌러 다시 확인해 주세요.`;
}

async function loadRates() {
  setLoading(true);

  let snapshotLoadedThisRun = false;

  try {
    if (!latestData) {
      try {
        const snapshot = await fetchSnapshot();
        render(snapshot);
        snapshotLoadedThisRun = true;
        showSnapshotWhileChecking();
      } catch (snapshotError) {
        console.warn('Stored exchange-rate snapshot unavailable:', snapshotError);
      }
    }

    const live = await fetchLiveRates();
    render(live);
    showFreshState();
  } catch (liveError) {
    console.error('Live exchange-rate request failed:', liveError);

    if (!latestData && !snapshotLoadedThisRun) {
      try {
        const snapshot = await fetchSnapshot();
        render(snapshot);
        showStaleState(liveError?.message || '최신 공개 환율을 확인하지 못했습니다.');
        return;
      } catch (snapshotError) {
        console.error('Stored exchange-rate snapshot also failed:', snapshotError);
      }
    }

    if (latestData) {
      showStaleState(liveError?.message || '최신 공개 환율을 확인하지 못했습니다.');
    } else {
      showFatalState(
        `${liveError?.message || '최신 공개 환율 조회에 실패했습니다.'} 저장된 마지막 정상값도 불러올 수 없습니다.`
      );
    }
  } finally {
    setLoading(false);
  }
}

function kstDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function makeRecord() {
  if (!latestData) {
    els.recordJson.textContent = '먼저 실제 환율 조회가 성공해야 합니다.';
    return;
  }

  generatedRecord = {
    signal_id: 'jpy-100-krw',
    record_date: kstDateKey(latestData.fetchedAt),
    source_url: latestData.sourceUrl,
    source_observed_at: latestData.sourceObservedAt.toISOString(),
    normalized_value: Number(latestData.normalized.jpy100Krw.toFixed(4)),
    unit: 'KRW/100JPY',
    fetched_at: latestData.fetchedAt.toISOString(),
    raw_krw: latestData.raw.rates.KRW,
    raw_jpy: latestData.raw.rates.JPY
  };

  els.recordJson.textContent = JSON.stringify(generatedRecord, null, 2);
  els.downloadRecord.disabled = false;
}

function downloadRecord() {
  if (!generatedRecord) return;

  const blob = new Blob(
    [`${JSON.stringify(generatedRecord, null, 2)}\n`],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `t04-day-${generatedRecord.record_date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

els.sourceLink.href = LIVE_SOURCE_URL;
els.refresh.addEventListener('click', loadRates);
els.makeRecord.addEventListener('click', makeRecord);
els.downloadRecord.addEventListener('click', downloadRecord);

loadRates();

setupSyntheticReplay().catch((error) => {
  console.error('T04 synthetic replay setup failed:', error);
});

setupLiveRecords().catch((error) => {
  console.error('T04 preserved live records setup failed:', error);
});

try {
  setupHistoryChart();
} catch (error) {
  console.error('T04 historical chart setup failed:', error);
}
