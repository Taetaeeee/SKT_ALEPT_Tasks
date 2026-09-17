import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_URL = 'https://open.er-api.com/v6/latest/USD';

function assertFinite(value, name) {
  if (!Number.isFinite(value)) {
    throw new Error(`Missing or invalid ${name}`);
  }
}

const response = await fetch(SOURCE_URL, {
  headers: {
    Accept: 'application/json',
    'User-Agent': 'SKT-ALEPT-T04-exchange-board/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Upstream HTTP ${response.status}`);
}

const raw = await response.json();
if (raw?.result !== 'success' || raw?.base_code !== 'USD') {
  throw new Error('Unexpected upstream response');
}

assertFinite(raw?.rates?.KRW, 'rates.KRW');
assertFinite(raw?.rates?.JPY, 'rates.JPY');
assertFinite(raw?.rates?.CNY, 'rates.CNY');
assertFinite(raw?.rates?.USD, 'rates.USD');
assertFinite(raw?.time_last_update_unix, 'time_last_update_unix');

const collectedAt = new Date();
const payload = {
  schema_version: 1,
  status: 'success',
  source_name: 'ExchangeRate-API',
  source_url: SOURCE_URL,
  source_observed_at: new Date(raw.time_last_update_unix * 1000).toISOString(),
  source_observed_at_raw: raw.time_last_update_utc,
  collected_at: collectedAt.toISOString(),
  next_update_at: Number.isFinite(raw.time_next_update_unix)
    ? new Date(raw.time_next_update_unix * 1000).toISOString()
    : null,
  base_code: 'USD',
  rates: {
    USD: raw.rates.USD,
    KRW: raw.rates.KRW,
    JPY: raw.rates.JPY,
    CNY: raw.rates.CNY
  },
  normalized: {
    usd_krw: raw.rates.KRW,
    cny_krw: raw.rates.KRW / raw.rates.CNY,
    jpy_100_krw: (raw.rates.KRW / raw.rates.JPY) * 100
  }
};

const outDir = path.join(process.cwd(), 'data');
await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, 'current-rates.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8'
);

console.log(`Saved current rates at ${payload.collected_at}`);
