import { fetchLiveRates, LIVE_SOURCE_URL } from './exchange-api.js';

const els = {
  status: document.querySelector('#status'),
  statusText: document.querySelector('#status-text'),
  jpy: document.querySelector('#jpy-value'),
  cny: document.querySelector('#cny-value'),
  usd: document.querySelector('#usd-value'),
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
  fetchMode: document.querySelector('#fetch-mode')
};

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

function formatKst(date) {
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? `${kstDateTime.format(date)} KST`
    : '-';
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function setLoading(isLoading) {
  els.refresh.disabled = isLoading;
  els.refresh.textContent = isLoading ? '조회 중…' : '최신 환율 다시 조회';
}

function showError(message) {
  els.status.dataset.state = 'error';
  els.statusText.textContent = '현재 환율 조회 실패';
  els.errorBox.hidden = false;
  els.errorBox.textContent = `${message} 마지막으로 화면에 표시된 값이 있다면 그대로 유지합니다.`;
}

function render(data) {
  const { normalized, raw } = data;

  els.jpy.textContent = `${formatNumber(normalized.jpy100Krw)}원`;
  els.cny.textContent = `${formatNumber(normalized.cnyKrw)}원`;
  els.usd.textContent = `${formatNumber(normalized.usdKrw)}원`;

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

  els.status.dataset.state = 'fresh';
  if (data.mode === 'github-snapshot') {
    els.statusText.textContent = '공개 원천 직접 조회 실패 · GitHub 저장 환율 표시 중';
    els.fetchMode.textContent = 'GitHub Actions 저장본 (실제 공개 원천에서 수집)';
  } else {
    els.statusText.textContent = '최신 공개 환율 직접 조회 성공';
    els.fetchMode.textContent = '브라우저 → 공개 원천 직접 조회';
  }
  els.errorBox.hidden = true;
}

async function loadRates() {
  setLoading(true);
  try {
    const data = await fetchLiveRates();
    render(data);
  } catch (error) {
    console.error(error);
    showError(error?.message || '알 수 없는 오류가 발생했습니다.');
  } finally {
    setLoading(false);
  }
}

els.sourceLink.href = LIVE_SOURCE_URL;
els.refresh.addEventListener('click', loadRates);
loadRates();
