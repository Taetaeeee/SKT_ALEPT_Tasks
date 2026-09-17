import fs from 'node:fs/promises';

const requiredFiles = [
  'T04_exchange_board/index.html',
  'T04_exchange_board/style.css',
  'T04_exchange_board/js/app.js',
  'T04_exchange_board/js/calculators.js',
  'T04_exchange_board/js/replay.js',
  'T04_exchange_board/js/replay-core.js',
  'T04_exchange_board/js/history.js',
  'T04_exchange_board/js/live-records.js',
  'T04_exchange_board/data/current-rates.json',
  'T04_exchange_board/data/live-records.json',
  'T04_exchange_board/fixture-manifest.json',
  'T04_exchange_board/public-contract.json',
  'T04_exchange_board/fixtures/normal-d1-a.json',
  'T04_exchange_board/fixtures/normal-d1-b.json',
  'T04_exchange_board/fixtures/normal-d2.json',
  'T04_exchange_board/fixtures/timeout.json',
  'T04_exchange_board/fixtures/auth-401.json',
  'T04_exchange_board/fixtures/rate-429.json',
  'T04_exchange_board/fixtures/offline.json',
  'T04_exchange_board/fixtures/schema-break.json',
  'T04_exchange_board/fixtures/recover-d2.json'
];

for (const file of requiredFiles) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error(`Missing or empty required file: ${file}`);
  }
}

const current = JSON.parse(
  await fs.readFile('T04_exchange_board/data/current-rates.json', 'utf8')
);

for (const code of ['KRW', 'JPY', 'CNY']) {
  const value = Number(current?.raw?.rates?.[code]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`current-rates.json has invalid ${code} rate`);
  }
}

const records = JSON.parse(
  await fs.readFile('T04_exchange_board/data/live-records.json', 'utf8')
);

if (!Array.isArray(records) || records.length < 1 || records.length > 2) {
  throw new Error(`live-records.json must contain 1 or 2 records before final submission; got ${records?.length}`);
}

const dates = new Set();

for (const [index, record] of records.entries()) {
  const prefix = `live-records[${index}]`;

  if (record.kind !== 't04_day') throw new Error(`${prefix}.kind must be t04_day`);
  if (record.signal_id !== 'jpy-100-krw') throw new Error(`${prefix}.signal_id mismatch`);
  if (record.unit !== 'KRW/100JPY') throw new Error(`${prefix}.unit mismatch`);
  if (record.record_timezone !== 'Asia/Seoul') throw new Error(`${prefix}.record_timezone mismatch`);
  if (!/^https:\/\//.test(record.source_url)) throw new Error(`${prefix}.source_url must be HTTPS`);
  if (Number.isNaN(new Date(record.source_observed_at).getTime())) {
    throw new Error(`${prefix}.source_observed_at invalid`);
  }
  if (Number.isNaN(new Date(record.fetched_at).getTime())) {
    throw new Error(`${prefix}.fetched_at invalid`);
  }
  if (dates.has(record.record_date)) throw new Error(`duplicate KST record_date: ${record.record_date}`);
  dates.add(record.record_date);

  const rawKrw = Number(record?.raw?.rates?.KRW);
  const rawJpy = Number(record?.raw?.rates?.JPY);
  const normalized = Number(record.normalized_value);

  if (![rawKrw, rawJpy, normalized].every(Number.isFinite)) {
    throw new Error(`${prefix} raw/normalized values must be finite numbers`);
  }

  const recalculated = Number(((rawKrw / rawJpy) * 100).toFixed(4));
  if (Math.abs(recalculated - normalized) > 0.00005) {
    throw new Error(
      `${prefix} normalized mismatch: stored ${normalized}, recalculated ${recalculated}`
    );
  }
}

if (records.length === 2) {
  const sorted = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date));
  if (sorted[0].record_date === sorted[1].record_date) {
    throw new Error('Final two records must have distinct Asia/Seoul dates.');
  }

  const delta = Number(
    (sorted[1].normalized_value - sorted[0].normalized_value).toFixed(4)
  );

  console.log(
    `T04 final live evidence ready: ${sorted[0].record_date} -> ${sorted[1].record_date}, delta ${delta} KRW/100JPY`
  );
} else {
  console.log(
    `T04 live evidence waiting for second KST date. Current preserved date: ${records[0].record_date}`
  );
}

const fixtureManifest = JSON.parse(
  await fs.readFile('T04_exchange_board/fixture-manifest.json', 'utf8')
);

const fixtureCount =
  Array.isArray(fixtureManifest.fixtures)
    ? fixtureManifest.fixtures.length
    : Array.isArray(fixtureManifest.fixture_files)
      ? fixtureManifest.fixture_files.length
      : null;

if (fixtureCount !== null && fixtureCount !== 9) {
  throw new Error(`Expected 9 official fixtures; manifest reports ${fixtureCount}`);
}

console.log('T04 preflight passed.');
