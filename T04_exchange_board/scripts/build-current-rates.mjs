import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error('usage: node build-current-rates.mjs <input-json> <output-json>');

const raw = JSON.parse(await readFile(input, 'utf8'));
if (raw?.result !== 'success' || raw?.base_code !== 'USD') throw new Error('Unexpected exchange-rate response');
for (const code of ['KRW','JPY','CNY']) {
  const value = Number(raw?.rates?.[code]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${code} rate`);
}
if (!Number.isFinite(Number(raw.time_last_update_unix))) throw new Error('Missing source timestamp');

const snapshot = {
  schema_version: 1,
  source_url: 'https://open.er-api.com/v6/latest/USD',
  source_observed_at: new Date(Number(raw.time_last_update_unix) * 1000).toISOString(),
  fetched_at: new Date().toISOString(),
  raw: {
    result: raw.result,
    base_code: raw.base_code,
    time_last_update_unix: Number(raw.time_last_update_unix),
    time_last_update_utc: raw.time_last_update_utc,
    rates: {
      USD: 1,
      KRW: Number(raw.rates.KRW),
      JPY: Number(raw.rates.JPY),
      CNY: Number(raw.rates.CNY)
    }
  }
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Wrote ${output}`);
console.log(`source_observed_at=${snapshot.source_observed_at}`);
console.log(`fetched_at=${snapshot.fetched_at}`);
