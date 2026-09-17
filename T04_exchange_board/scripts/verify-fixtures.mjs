import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const manifestPath =
  'T04_exchange_board/docs/official/asset-manifest.json';
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

const fixtureEntries = manifest.files.filter((item) =>
  item.path.startsWith('fixtures/')
);

if (fixtureEntries.length !== 9) {
  throw new Error(`Official asset manifest should list 9 fixtures; got ${fixtureEntries.length}`);
}

let passed = 0;

for (const entry of fixtureEntries) {
  const projectPath = `T04_exchange_board/${entry.path}`;
  const content = await fs.readFile(projectPath);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');

  if (content.length !== entry.bytes) {
    throw new Error(
      `${entry.path} byte length mismatch: ${content.length} != ${entry.bytes}`
    );
  }

  if (sha256 !== entry.sha256) {
    throw new Error(
      `${entry.path} SHA-256 mismatch: ${sha256} != ${entry.sha256}`
    );
  }

  passed += 1;
  console.log(`PASS ${entry.path} ${sha256}`);
}

console.log(
  `Official fixture integrity passed: ${passed}/9 files match asset-manifest.json.`
);
