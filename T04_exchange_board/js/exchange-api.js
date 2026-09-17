export const LIVE_SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHED_SOURCE_URL = './data/current-rates.json';

function normalizeRaw(raw, fetchedAt, mode = 'direct') {
  if (
    raw?.result !== 'success' ||
    raw?.base_code !== 'USD' ||
    !Number.isFinite(raw?.rates?.KRW) ||
    !Number.isFinite(raw?.rates?.JPY) ||
    !Number.isFinite(raw?.rates?.CNY) ||
    !Number.isFinite(raw?.rates?.USD) ||
    !Number.isFinite(raw?.time_last_update_unix)
  ) {
    throw new Error('환율 원천의 응답 형식이 예상과 다릅니다.');
  }

  return {
    mode,
    sourceUrl: LIVE_SOURCE_URL,
    sourceName: 'ExchangeRate-API',
    sourceObservedAt: new Date(raw.time_last_update_unix * 1000),
    fetchedAt,
    sourceObservedAtRaw: raw.time_last_update_utc,
    raw,
    normalized: {
      jpy100Krw: (raw.rates.KRW / raw.rates.JPY) * 100,
      cnyKrw: raw.rates.KRW / raw.rates.CNY,
      usdKrw: raw.rates.KRW
    }
  };
}

async function fetchDirect() {
  const fetchedAt = new Date();
  const response = await fetch(LIVE_SOURCE_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response.ok) {
    const error = new Error(`환율 원천 응답 오류: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return normalizeRaw(await response.json(), fetchedAt, 'direct');
}

async function fetchGithubSnapshot() {
  const response = await fetch(`${CACHED_SOURCE_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('GitHub에 저장된 환율 데이터도 읽을 수 없습니다.');
  }

  const saved = await response.json();
  if (saved?.status !== 'success') {
    throw new Error(saved?.message || 'GitHub 환율 데이터가 아직 생성되지 않았습니다.');
  }

  const raw = {
    result: 'success',
    base_code: saved.base_code,
    time_last_update_unix: Math.floor(new Date(saved.source_observed_at).getTime() / 1000),
    time_last_update_utc: saved.source_observed_at_raw,
    rates: saved.rates
  };

  const result = normalizeRaw(raw, new Date(saved.collected_at), 'github-snapshot');
  result.snapshotCollectedAt = new Date(saved.collected_at);
  return result;
}

export async function fetchLiveRates() {
  try {
    return await fetchDirect();
  } catch (directError) {
    try {
      const fallback = await fetchGithubSnapshot();
      fallback.directError = directError;
      return fallback;
    } catch (fallbackError) {
      const combined = new Error(
        `${directError?.message || '직접 조회 실패'} / ${fallbackError?.message || '저장 데이터 조회 실패'}`
      );
      combined.cause = { directError, fallbackError };
      throw combined;
    }
  }
}
