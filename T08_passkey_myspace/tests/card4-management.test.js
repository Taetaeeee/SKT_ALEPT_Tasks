import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePasskeyManagement } from '../src/passkey-management.js';

const BASE_URL = 'https://t08-passkey-myspace.example.workers.dev';
const TOKEN = 'A'.repeat(43);
const since = () => Math.floor(Date.now() / 1000);
const key = (id, userId, label) => ({ credential_id: id, user_id: userId, label, registered_at: since() });

class FakeDB {
  constructor(own = [key('key_A1', 'A', 'My-PC'), key('key_A2', 'A', 'Backup')],
              sessions = [{ user_id: 'A', created_at: since() }]) {
    this.passkeys = [...own, key('key_B1', 'B', 'Test-Key')];
    this.sessions = sessions.map(s => ({ ...s }));
  }
  prepare(sql) {
    const db = this;
    return {
      bind(...args) {
        return {
          async all() {
            assert.match(sql, /SELECT credential_id, label, registered_at FROM passkeys WHERE user_id/);
            const rows = db.passkeys.filter(x => x.user_id === args[0])
              .sort((a,b) => b.registered_at - a.registered_at || a.credential_id.localeCompare(b.credential_id));
            return { results: rows.map(r => ({credential_id: r.credential_id, label: r.label, registered_at: r.registered_at})) };
          },
          async first() {
            if (sql.startsWith('SELECT created_at FROM sessions')) {
              const s = db.sessions.find(x => x.user_id === args[1]);
              return s ? {created_at: s.created_at} : null;
            }
            if (sql.startsWith('SELECT 1 AS found FROM passkeys')) {
              return db.passkeys.some(x => x.credential_id === args[0] && x.user_id === args[1]) ? {found: 1} : null;
            }
            throw Error('unrecognized SQL .first: ' + sql);
          },
          async run() {
            if (sql.includes('DELETE FROM passkeys')) {
              const [credentialId, ownerId] = args;
              const owned = db.passkeys.filter(x => x.user_id === ownerId);
              if (owned.length <= 1) return { meta: { changes: 0 } };
              const exists = db.passkeys.some(x => x.credential_id === credentialId && x.user_id === ownerId);
              if (!exists) return { meta: { changes: 0 } };
              db.passkeys = db.passkeys.filter(x => !(x.credential_id === credentialId && x.user_id === ownerId));
              return { meta: { changes: 1 } };
            }
            if (sql.startsWith('DELETE FROM sessions')) {
              const n = db.sessions.length;
              db.sessions = db.sessions.filter(x => x.user_id !== args[0]);
              return {meta: {changes: n - db.sessions.length}};
            }
            throw Error('unrecognized SQL .run: ' + sql);
          },
        };
      },
    };
  }
}
function request(path, body, origin = BASE_URL) {
  const headers = { Cookie: `t08_session=${TOKEN}`, Origin: origin, 'Content-Type': 'application/json' };
  return new Request(BASE_URL + path, {
    method: body === undefined ? 'GET' : 'POST', headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const userA = async () => 'A';

test('C43 목록: testA는 testA의 레이블·등록시각만 확인할 수 있다', async () => {
  const r = await handlePasskeyManagement(request('/api/passkeys/manage'), {DB: new FakeDB()}, userA);
  assert.equal(r.status, 200);
  const payload = await r.json();
  assert.equal(payload.count, 2);
  assert.deepEqual(payload.passkeys.map(p => p.label).sort(), ['Backup','My-PC']);
  assert.ok(payload.passkeys.every(p => typeof p.registeredAt === 'number' && !('publicKey' in p)));
});

test('다른 계정의 패스키 삭제를 막으며, testB 패스키를 보존한다', async () => {
  const db = new FakeDB();
  const r = await handlePasskeyManagement(request('/api/passkeys/manage/delete', {credentialId: 'key_B1'}), {DB: db}, userA);
  assert.equal(r.status, 404);
  assert.equal(db.passkeys.length, 3);
  assert.equal(db.sessions.length, 1);
});

test('C46 마지막 패스키 삭제: 서버에서 409로 막는다', async () => {
  const db = new FakeDB([key('key_A1', 'A', 'My-PC')]);
  const r = await handlePasskeyManagement(request('/api/passkeys/manage/delete', {credentialId: 'key_A1'}), {DB: db}, userA);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), {error: 'last_passkey_protected'});
  assert.equal(db.passkeys.filter(p => p.user_id === 'A').length, 1);
});

test('C44 삭제 후 한 패스키가 남고, 모든 기존 세션을 폐기한다', async () => {
  const db = new FakeDB();
  const r = await handlePasskeyManagement(request('/api/passkeys/manage/delete', {credentialId: 'key_A1'}), {DB: db}, userA);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), {deleted: true, remainingCount: 1, loggedOut: true});
  assert.match(r.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Strict; Max-Age=0/);
  assert.equal(db.passkeys.filter(x => x.user_id === 'A').length, 1);
  assert.equal(db.sessions.length, 0);
});

test('익명 요청은 401, 교차 출처의 삭제 요청은 403', async () => {
  const db = new FakeDB();
  const anonymous = await handlePasskeyManagement(request('/api/passkeys/manage'), {DB: db}, async () => null);
  assert.equal(anonymous.status, 401);
  const csrf = await handlePasskeyManagement(request('/api/passkeys/manage/delete', {credentialId:'key_A1'}, 'https://attacker.example'), {DB: db}, userA);
  assert.equal(csrf.status, 403);
});

test('10분 초과 오래된 세션은 삭제 거절, 패스키는 유지', async () => {
  const db = new FakeDB(undefined, [{user_id: 'A', created_at: since()-601}]);
  const r = await handlePasskeyManagement(request('/api/passkeys/manage/delete', {credentialId:'key_A1'}), {DB: db}, userA);
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'recent_login_required');
  assert.equal(db.passkeys.filter(x => x.user_id === 'A').length, 2);
});

test('카드 4 화면·서버 라우트 연결 유지 및 개인정보·개인키 노출 금지', async () => {
  const files = await Promise.all(['src/index.js','public/index.html','public/auth-ui.js','public/myspace.js','public/passkey-manager.js'].map(x => readFile(new URL('../'+x, import.meta.url),'utf8')));
  const [server,html,auth,reg,manager] = files;
  assert.match(server, /handlePasskeyManagement\(request, env, verifiedUserId\)/);
  assert.match(html, /id="passkeyList"/);
  assert.match(html, /passkey-manager\.js/);
  assert.match(auth, /t08:auth-changed/);
  assert.match(auth, /t08:session-revoked/);
  assert.match(reg, /t08:passkey-registered/);
  assert.match(manager, /Asia\/Seoul/);
  assert.match(manager, /window\.confirm/);
  assert.doesNotMatch(manager, /\.innerHTML\s*=/);
  assert.doesNotMatch(html, /type=["']password["']/);
});
