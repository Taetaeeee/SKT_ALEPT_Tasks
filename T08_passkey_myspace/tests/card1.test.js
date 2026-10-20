import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../src/index.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const base = 'http://localhost:8787';
const bareEnv = {
  ASSETS: { fetch: async () => new Response('<html lang="ko"><h1>PUBLIC T01</h1></html>',
    { headers: { 'Content-Type': 'text/html' } }) },
};
function request(path, options = {}, env = bareEnv) {
  return worker.fetch(new Request(`${base}${path}`, options), env);
}

test('C13: 공개 소개 화면은 인증 없이 열리고 HTML에 가상 자료 본문이 없다', async () => {
  const result = await request('/');
  assert.equal(result.status, 200);
  const html = await result.text();
  assert.match(html, /PUBLIC T01/);
  assert.doesNotMatch(html, /PRIVATE_FIXTURE_CONTENT/);
});

test('C15 C16 C17: 비로그인 직접 API 요청은 401, 자료 본문 없음', async () => {
  const result = await request('/api/private/items');
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: 'unauthorized', message: '패스키 인증이 필요합니다.' });
  assert.equal(result.headers.get('Cache-Control'), 'no-store, private');
});

test('C16 C17: 개별 자료 URL 직접 호출도 401', async () => {
  assert.equal((await request('/api/private/items/some-id')).status, 401);
});

test('인증 라우트가 없는 상태에서 임의 API 호출 및 쓰기 요청으로 인증을 우회할 수 없음', async () => {
  assert.equal((await request('/api/auth/register', {method: 'POST'})).status, 404);
  assert.equal((await request('/api/private/items', {method: 'POST'})).status, 405);
  assert.deepEqual(await (await request('/api/auth/status')).json(), {authenticated: false});
});

test('사용자 ID를 URL에 넣어도 인증 없이 데이터를 읽을 수 없음', async () => {
  assert.equal((await request('/api/private/items?user_id=another')).status, 401);
});

test('장래 유효한 세션을 발급했을 때: 서버 소유자 기준으로 조회하며 다른 사용자 자료는 포함하지 않음 (모의 DB)', async () => {
  const token = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const hashBytes = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Buffer.from(hashBytes).toString('hex');
  const captured = [];
  const db = {
    prepare(query) {
      return { bind(...args) {
        captured.push({ query, args });
        return {
          async first() {
            if (query.includes('FROM sessions')) return args[0] === tokenHash ? { user_id: 'user-A' } : null;
            return null;
          },
          async all() {
            return { results: [
              { id: 'item1', title: '가상 메모 1', body: 'PRIVATE_FIXTURE_CONTENT', created_at: 1 },
              { id: 'item2', title: '가상 메모 2', body: 'PRIVATE_FIXTURE_CONTENT', created_at: 2 },
              { id: 'item3', title: '가상 메모 3', body: 'PRIVATE_FIXTURE_CONTENT', created_at: 3 },
            ]};
          },
        };
      }};
    },
  };
  const result = await request('/api/private/items?user_id=user-B',
    { headers: { Cookie: `t08_session=${token}` } }, { ...bareEnv, DB: db });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).items.length, 3);
  const query = captured.find(item => item.query.includes('FROM private_items'));
  assert.deepEqual(query.args, ['user-A']);
  assert.match(query.query, /WHERE owner_id = \?/);
});

test('실제 public/index.html: T01 핵심 내용 유지 + MY SPACE 추가 + 실제 비공개 본문 없음', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /시스템의 흐름을 이해하고/);
  assert.match(html, /PUBLIC EVIDENCE/);
  assert.match(html, /id="my-space"/);
  assert.match(html, /id="checkPrivateAccess"/);
  assert.doesNotMatch(html, /PRIVATE_FIXTURE_CONTENT/);
  assert.doesNotMatch(html, /type=["']password["']/i);
});
