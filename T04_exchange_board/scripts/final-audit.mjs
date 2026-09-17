import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const finalMode = process.argv.includes('--final');
const root = 'T04_exchange_board';

const result = [];
function add(id, status, note) {
  result.push({ id, status, note });
}

async function exists(path) {
  try {
    const stat = await fs.stat(path);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

const requiredRuntime = [
  'index.html',
  'style.css',
  'js/app.js',
  'js/calculators.js',
  'js/replay.js',
  'js/replay-core.js',
  'js/history.js',
  'js/live-records.js',
  'fixture-manifest.json',
  'public-contract.json',
  'data/live-records.json'
];

const missingRuntime = [];
for (const rel of requiredRuntime) {
  if (!(await exists(`${root}/${rel}`))) missingRuntime.push(rel);
}

if (missingRuntime.length) {
  console.error(`Missing required runtime files: ${missingRuntime.join(', ')}`);
  process.exit(1);
}

const contract = JSON.parse(
  await fs.readFile(`${root}/public-contract.json`, 'utf8')
);

if (contract.task_id !== 'T04' || contract.condition_count !== 35) {
  throw new Error('public-contract.json does not describe T04 with 35 conditions.');
}

const registry = JSON.parse(
  await fs.readFile(`${root}/docs/official/criterion-registry.json`, 'utf8')
);

if (!Array.isArray(registry.criteria) || registry.criteria.length !== 35) {
  throw new Error('criterion-registry.json does not contain exactly 35 criteria.');
}

const fixtureManifest = JSON.parse(
  await fs.readFile(`${root}/docs/official/asset-manifest.json`, 'utf8')
);

for (const entry of fixtureManifest.files.filter((x) => x.path.startsWith('fixtures/'))) {
  const content = await fs.readFile(`${root}/${entry.path}`);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  if (digest !== entry.sha256 || content.length !== entry.bytes) {
    throw new Error(`Official fixture mismatch: ${entry.path}`);
  }
}

const records = JSON.parse(
  await fs.readFile(`${root}/data/live-records.json`, 'utf8')
);

if (!Array.isArray(records) || records.length < 1 || records.length > 2) {
  throw new Error(`live-records.json must contain 1 or 2 records; got ${records?.length}`);
}

const dates = new Set();
for (const r of records) {
  if (r.kind !== 't04_day') throw new Error('live record kind must be t04_day');
  if (r.signal_id !== 'jpy-100-krw') throw new Error('live record signal_id mismatch');
  if (r.unit !== 'KRW/100JPY') throw new Error('live record unit mismatch');
  if (r.record_timezone !== 'Asia/Seoul') throw new Error('live record timezone mismatch');
  if (dates.has(r.record_date)) throw new Error(`duplicate live record date: ${r.record_date}`);
  dates.add(r.record_date);

  const recalculated = Number(
    ((Number(r.raw.rates.KRW) / Number(r.raw.rates.JPY)) * 100).toFixed(4)
  );
  if (Math.abs(recalculated - Number(r.normalized_value)) > 0.00005) {
    throw new Error(`live normalized value mismatch for ${r.record_date}`);
  }
}

if (finalMode && records.length !== 2) {
  console.error(
    `FINAL AUDIT BLOCKED: C22 requires exactly 2 actual Asia/Seoul dates; currently ${records.length}/2.`
  );
  process.exit(2);
}

if (records.length === 2) {
  const sorted = [...records].sort((a, b) =>
    a.record_date.localeCompare(b.record_date)
  );
  const delta = Number(
    (sorted[1].normalized_value - sorted[0].normalized_value).toFixed(4)
  );
  const percent =
    sorted[0].normalized_value === 0
      ? null
      : Number(
          (
            ((sorted[1].normalized_value - sorted[0].normalized_value) /
              sorted[0].normalized_value) *
            100
          ).toFixed(2)
        );

  console.log(
    `C22-C24 data ready: ${sorted[0].record_date} -> ${sorted[1].record_date}, delta=${delta}, percent=${percent}`
  );
}

const currentlyPending = new Set(
  records.length === 2 ? [] : ['T04-C22', 'T04-C23', 'T04-C24']
);

for (const criterion of registry.criteria) {
  const id = criterion.id;

  if (currentlyPending.has(id)) {
    add(id, 'PENDING', '둘째 실제 KST 날짜 기록 필요');
    continue;
  }

  if (['T04-C27', 'T04-C28', 'T04-C34', 'T04-C35'].includes(id)) {
    add(id, 'SUBMISSION', '최종 제출 필드에서 확인');
    continue;
  }

  if (
    ['T04-C01','T04-C02','T04-C29','T04-C30','T04-C31','T04-C32','T04-C33'].includes(id)
  ) {
    add(id, 'MANUAL', '새 시크릿 창에서 결과물/소스 URL 직접 확인');
    continue;
  }

  if (id === 'T04-C11') {
    add(id, 'AUTOMATED+MANUAL', 'Git history high-confidence secret scan + DevTools Network 확인');
    continue;
  }

  if (id === 'T04-C25') {
    add(id, 'MANUAL', '공개 화면/제출 파일 개인정보 0건 확인');
    continue;
  }

  add(id, 'IMPLEMENTED', '현재 구현/fixture/live evidence에서 검사 대상');
}

console.log('\nT04 AUDIT MATRIX');
for (const row of result) {
  console.log(`${row.id.padEnd(8)} ${row.status.padEnd(16)} ${row.note}`);
}

const pending = result.filter((row) => row.status === 'PENDING');
console.log(
  `\nAudit phase=${finalMode ? 'FINAL' : 'PREFLIGHT'}; actual live records=${records.length}/2; pending=${pending.length}`
);

if (finalMode) {
  console.log(
    'FINAL DATA AUDIT PASSED. Manual public-access, privacy, DevTools, and submission-field checks are still required.'
  );
} else {
  console.log(
    'PREFLIGHT PASSED. Re-run with --final after the second actual KST-day record is preserved.'
  );
}
