import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const file = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('C27 C28: authentication challenge is generated and stored as hash in D1', async () => {
  const src = await file('src/authentication.js');
  assert.match(src, /generateAuthenticationOptions\(/);
  assert.match(src, /digestHex\(opts\.challenge\)/);
  assert.match(src, /'authenticate'/);
  assert.match(src, /rp_origin/);
  assert.match(src, /CHALLENGE_TTL = 300/);
});
test('C29 C30: verification uses actual credential public key from D1', async () => {
  const src = await file('src/authentication.js');
  assert.match(src, /verifyAuthenticationResponse\(/);
  assert.match(src, /FROM passkeys WHERE credential_id = \?/);
  assert.match(src, /publicKey: keyAsBytes\(passkey\.public_key\)/);
  assert.match(src, /expectedRPID: new URL\(challenge\.rp_origin\)\.hostname/);
  assert.match(src, /requireUserVerification: true/);
  assert.match(src, /return error\('authentication_failed', 401\)/);
});
test('C31: used challenges must be consumed exactly once before session issued', async () => {
  const src = await file('src/authentication.js');
  assert.match(src, /consumed_at IS NULL AND expires_at > \?/);
  assert.match(src, /claimed\.meta\?\.changes !== 1/);
  assert.ok(src.indexOf('consumed_at IS NULL AND expires_at > ?') < src.indexOf('verifyAuthenticationResponse('));
  assert.ok(src.indexOf('verifyAuthenticationResponse(') < src.indexOf('INSERT INTO sessions'));
});
test('C32 C33 C34: hash-only server sessions and logout revocation + safe cookie', async () => {
  const src = await file('src/authentication.js');
  assert.match(src, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(src, /SESSION_TTL = 12 \* 60 \* 60/);
  assert.match(src, /digestHex\(sessionToken\)/);
  assert.match(src, /DELETE FROM sessions WHERE session_hash = \?/);
  assert.match(src, /Set-Cookie/);
  assert.doesNotMatch(src, /return json\(\{[^}]*sessionToken/);
});
test('비공개 자료는 서버에서만 조회하고 DOM textContent로만 렌더링', async () => {
  const html = await file('public/index.html');
  const ui = await file('public/auth-ui.js');
  const server = await file('src/index.js');
  assert.match(html, /id="loginPasskey"/);
  assert.match(html, /id="logoutPasskey"/);
  assert.doesNotMatch(html, /type=["']password["']/i);
  assert.match(ui, /fetchJSON\('\/api\/private\/items'\)/);
  assert.match(ui, /title\.textContent = item\.title/);
  assert.match(ui, /body\.textContent = item\.body/);
  assert.doesNotMatch(ui, /innerHTML\s*=/);
  assert.match(server, /WHERE owner_id = \?/);
});
test('기존 등록/취소 라우트와 비로그인 접근 제한 유지', async () => {
  const server = await file('src/index.js');
  const registration = await file('src/registration.js');
  assert.match(server, /handleRegistration\(/);
  assert.match(server, /handleAuthentication\(/);
  assert.match(server, /if \(!userId\) return reply\(\{ error: 'unauthorized'/);
  assert.match(registration, /verifyRegistrationResponse\(/);
  assert.match(registration, /register\/cancel/);
});
