import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const file = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('카드2 UI는 비밀번호를 받지 않으며 패스키 등록/취소 제어가 있다', async () => {
  const html = await file('public/index.html');
  assert.match(html, /id="passkeyRegisterForm"/);
  assert.match(html, /id="passkeyNickname"/);
  assert.match(html, /id="passkeyLabel"/);
  assert.match(html, /id="cancelPasskeyRegister"/);
  assert.doesNotMatch(html, /type\s*=\s*['"]password['"]/i);
});

test('서버는 등록 WebAuthn 검증 전 공개키를 저장하지 않는다 (정적 검토)', async () => {
  const server = await file('src/registration.js');
  assert.match(server, /verifyRegistrationResponse\(/);
  assert.match(server, /requireUserVerification: true/);
  assert.match(server, /expectedOrigin: pending\.rp_origin/);
  assert.match(server, /expectedRPID/);
  assert.match(server, /consumed_at IS NULL/);
  assert.ok(server.indexOf('verifyRegistrationResponse(') < server.indexOf('INSERT INTO passkeys'));
});

test('등록해도 로그인 세션을 발급하지 않고, 비공개 API는 유효 세션을 요구한다', async () => {
  const reg = await file('src/registration.js');
  const api = await file('src/index.js');
  assert.doesNotMatch(reg, /INSERT INTO sessions/);
  assert.match(api, /if \(!userId\) return reply\(\{ error: 'unauthorized'/);
});

test('마이그레이션에 필요한 challenge 메타데이터 4열을 포함한다', async () => {
  const sql = await file('migrations/0002_registration_metadata.sql');
  for (const name of ['pending_nickname', 'pending_label', 'pending_user_id', 'rp_origin']) {
    assert.match(sql, new RegExp(`ALTER TABLE challenges ADD COLUMN ${name}`));
  }
});
