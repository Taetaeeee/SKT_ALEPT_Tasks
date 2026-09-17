import fs from 'node:fs/promises';
import path from 'node:path';

const [rawPath, recordsPath] = process.argv.slice(2);

if (!rawPath || !recordsPath) {
  console.error('usage: node capture-second-live-record.mjs <raw-api-json> <live-records.json>');
  process.exit(2);
}

const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));

if (raw?.result !== 'success' || raw?.base_code !== 'USD') {
  throw new Error('ExchangeRate-API response is not a successful USD-base payload.');
}

const krw = Number(raw?.rates?.KRW);
const jpy = Number(raw?.rates?.JPY);

if (!Number.isFinite(krw) || krw <= 0 || !Number.isFinite(jpy) || jpy <= 0) {
  throw new Error('KRW/JPY rates are missing or invalid.');
}

let records = [];
try {
  records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

if (!Array.isArray(records)) {
  throw new Error('live-records.json must contain an array.');
}

if (records.length >= 2) {
  console.log('T04 live evidence already contains 2 records. No additional record will be added.');
  process.exit(0);
}

const now = new Date();

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

const recordDate = kstDateKey(now);

if (records.some((record) => record?.record_date === recordDate)) {
  console.log(`A live record for ${recordDate} KST already exists. No duplicate will be added.`);
  process.exit(0);
}

if (records.length === 1 && records[0]?.record_date >= recordDate) {
  console.log(
    `Current KST date ${recordDate} is not later than preserved date ${records[0]?.record_date}. No record added.`
  );
  process.exit(0);
}

const sourceObservedAt = new Date(Number(raw.time_last_update_unix) * 1000);
if (Number.isNaN(sourceObservedAt.getTime())) {
  throw new Error('time_last_update_unix is invalid.');
}

const normalizedValue = Number(((krw / jpy) * 100).toFixed(4));

const record = {
  kind: 't04_day',
  signal_id: 'jpy-100-krw',
  record_date: recordDate,
  source_name: 'ExchangeRate-API',
  source_url: 'https://open.er-api.com/v6/latest/USD',
  source_observed_at: sourceObservedAt.toISOString(),
  normalized_value: normalizedValue,
  unit: 'KRW/100JPY',
  fetched_at: now.toISOString(),
  record_timezone: 'Asia/Seoul',
  raw: {
    base_code: 'USD',
    rates: {
      KRW: krw,
      JPY: jpy
    },
    formula: 'rates.KRW / rates.JPY * 100'
  }
};

records.push(record);
records.sort((a, b) => a.record_date.localeCompare(b.record_date));

if (records.length > 2) {
  throw new Error('Refusing to preserve more than exactly 2 T04 live-day records.');
}

await fs.mkdir(path.dirname(recordsPath), { recursive: true });
await fs.writeFile(recordsPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');

console.log(
  `Added T04 live record: ${record.record_date}, ${record.normalized_value} ${record.unit}, source ${record.source_observed_at}`
);
