# T08 — 내 소개 페이지에 패스키 달기

## 카드 1 시작본 (C13~C18)

- **기존 T01 공개 소개를 그대로 복사**하고 상단 내비게이션과 하단에 `MY SPACE`를 추가했습니다.
- 비공개 자료는 프론트엔드 HTML/JS에 넣지 않습니다. 향후 `Cloudflare D1`의 `private_items` 테이블에 사용자별로 저장합니다.
- `GET /api/private/items`, `GET /api/private/items/:id`는 **검증된 서버 세션**에서만 처리합니다. 아직 패스키/세션 발급은 없으므로 현재 401을 반환합니다.
- **비공개 자료 3건의 실제 생성은 다음 단계**(패스키 인증 연결 후)에서 진행합니다. 이 1단계 결과물을 최종 과제 통과라고 표시하면 안 됩니다.
- 실제 개인 정보 및 비밀값 사용 금지. 테스트 자료는 모두 합성 내용으로 만드세요.

### 저장소에 넣을 경로

`SKT_ALEPT_Tasks/T08_passkey_myspace/`

T01 원본 `T01_onepagemyself` 폴더는 **절대 수정하거나 지우지 않습니다.**

### 1. Node.js 설치 후 로컬 확인 (Windows PowerShell 또는 터미널)

아래 명령은 **T08_passkey_myspace 폴더에서** 실행합니다.

```powershell
npm install
npm test
npm run db:local
npm run dev
```

열기: `http://localhost:8787/`

> `wrangler.jsonc`의 `database_id`는 로컬 개발 전용 임시 UUID입니다. 실제 Cloudflare에 배포하기 **전에 반드시 실제 D1 ID로 교체**하세요. `--local`로 적용한 데이터는 원격 DB 데이터와 별개입니다.

### 2. 수동 확인 (카드 1)

1. 첫 화면에서 기존 T01의 공개 자기소개가 보이는지 확인합니다.
2. 메뉴 `MY SPACE`를 눌러 `🔒 비공개 · 잠김` 표시를 확인합니다.
3. `비로그인 접근 검사` 버튼을 눌러 `401` 표시가 나오는지 확인합니다.
4. 개발자 도구(F12) → Network → `GET /api/private/items` → **Status 401**, Response에 `{ "error": "unauthorized", ... }`가 있는지 확인합니다.
5. 새 시크릿 창에서 `http://localhost:8787/api/private/items`에 직접 들어가도 **401**인지 확인합니다.
6. 페이지 소스보기 (`Ctrl+U`)에서 비공개 자료의 실제 제목·본문이 포함되지 않는지 검사합니다.
7. 기존 T01 `공개용 ERD 보기`, `Fabric 구성 근거 보기`, 취향 보기와 사진 확대 기능을 확인합니다.

**주의:** `public/index.html`을 파일로 직접 열거나 GitHub Pages만 열면 Workers 서버가 없으므로 `/api` 테스트가 안 됩니다. 반드시 `wrangler dev` 혹은 Workers 배포 주소에서 검사해야 합니다.

### 3. Cloudflare 배포 (원격 실습 준비 뒤)

먼저 Cloudflare 계정에 로그인합니다.

```powershell
npx wrangler login
npx wrangler d1 create t08-passkey-db
```

출력에서 `database_id` 값을 확인해 **`wrangler.jsonc`의 임시 UUID를 실제 발급된 값으로 교체**합니다. `database_name`도 콘솔에 나타난 이름과 일치해야 합니다.

```powershell
npm run db:remote
npm run deploy
```

배포 결과의 `https://...workers.dev/` URL에서 1~6번 수동 검사를 다시 진행합니다. GitHub Pages는 T01 이전 제출물로만 유지합니다.

### 코드 구조

```text
public/index.html, styles.css, script.js  : 기존 T01 + 새로운 잠금 영역
public/myspace.js                          : 비로그인 접근 검사 UI
src/index.js                               : Workers 라우팅, 세션 확인, 비공개 자료 접근 차단
migrations/0001_init.sql                   : users/passkeys/challenges/sessions/private_items
tests/card1.test.js                        : API 자동 검사 (모의 DB 사용)
```

### C13~C18 진행 상태

| ID | 통과 정의 | 현재 |
|---|---|---|
| C13 | 공개/비공개 영역 구분 | **구현**, 브라우저 최종 확인 필요 |
| C14 | 실제 비공개 항목 ≥ 3 | **미완료**, 다음 단계에서 계정별 자료 생성 |
| C15 | 비로그인 화면에 자료 노출 0건 | **구현**, 배포 점검 필요 |
| C16 | 서버 직접 요청 거절 | **구현**, 배포 점검 필요 |
| C17 | HTTP 401/403 | **구현**, 자동 검사 401 확인 |
| C18 | 비로그인 HTML 소스에 비공개 본문 0건 | **구현**, 배포 점검 필요 |

### 테스트 한계

`npm test`는 Workers 핸들러 함수와 모의 D1을 직접 호출해 **코드 경로를 검사**합니다. 실제 Cloudflare 배포, 브라우저/기기에서의 패스키 인증, D1 운영 데이터 저장까지 검증한 것은 아닙니다. 인증 생성 기능은 현재 의도적으로 존재하지 않습니다.

### 다음 단계

카드 2에서 표준 WebAuthn 라이브러리로 등록 challenge 발급·검증·공개키 보관을 구현하고, 카드 3에서 실제 서명 검증 후 세션을 발급합니다. 그 뒤 실제 가상 비공개 자료를 **서버 DB에 3건 이상 저장**하여 C14까지 통과시킵니다. 새로운 계정의 첫 패스키 등록은 임의 사용자 닉네임만으로 기존 계정에 패스키를 추가할 수 없도록 설계해야 합니다.
