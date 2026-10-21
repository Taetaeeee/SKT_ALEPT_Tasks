# T08 — 내 소개 페이지에 패스키 달기

## 카드 1~3 구현본 (2026-10-20)

**T01 공개 소개 내용은 그대로 유지합니다.** T08에는 MY SPACE를 추가하고, 비공개 API는 서버 세션이 없으면 401을 반환합니다.

### 카드 4 변경 사항 (T08-C42~C46)

- `src/passkey-management.js`: 서버 세션 기반 `GET /api/passkeys/manage`, `POST /api/passkeys/manage/delete` 추가.
- 현재 계정 소유 패스키만 이름·등록 날짜와 함께 보여 주며, 다른 계정 패스키 삭제는 404.
- 마지막 패스키의 삭제는 **서버에서도 409로 차단**. 삭제는 로그인 직후 10분 내에만 가능.
- 삭제에 성공하면 해당 계정의 **모든 서버 세션 폐기** 및 쿠키 만료. 남은 패스키로 재로그인 필요.
- 화면: 로그인한 사용자만 목록을 볼 수 있으며 등록 성공 시 목록 자동 새로고침.
- 현재 `testA / My-PC` 1개, `testB / Test-Key` 1개는 별개의 계정! **C42는 testA에 새 패스키를 추가**해야 충족.
- 기존 DB 스키마 변경과 D1 Console SQL 실행 **불필요**. `wrangler.jsonc` 교체 금지.
- **코드/모의 DB 테스트**: `tests/card4-management.test.js` 7건 (실제 Bitwarden/D1 검사는 배포 후).
- 단계별 검증/제출용 표: `evidence/CARD4_RECOVERY.md`.

### 카드 3 변경 사항 (T08-C27~C35)

- `src/authentication.js`에 `POST /api/passkeys/login/options`, `POST /api/passkeys/login/verify`, `POST /api/auth/logout` 구현.
- 로그인마다 새 일회용 challenge 생성, D1 `challenges`에 **SHA-256 해시**로 5분 저장.
- 로그인 assertion은 서버 저장 공개키와 `@simplewebauthn/server@14.0.3`으로 서명·Origin·RP ID·사용자 검증 확인.
- challenge는 **서명 검증 전 1회용으로 소비**되어 잘못된 서명도 재사용할 수 없음.
- 검증 성공 후에만 32바이트 난수 세션 발급. D1에는 **세션 토큰의 해시** 저장, 브라우저에는 `HttpOnly; Secure; SameSite=Strict` 쿠키 보관, 12시간 후 만료.
- 로그아웃은 서버 세션을 삭제하고 쿠키를 만료시킴. 이후 비공개 API는 다시 401.
- `public/auth-ui.js`에서 `navigator.credentials.get()` 사용, 인증된 사람의 서버 자료만 받아 `textContent`로 표시 (XSS 완화).
- 로그인 상태에서 등록 폼을 사용하면 **현재 계정에 두 번째 패스키 추가**가 가능. 계정별 패스키 목록/삭제는 다음 카드에서 구현.
- **D1 추가 SQL 불필요**: 이미 생성한 `users`, `passkeys`, `challenges`, `sessions`, `private_items` 구조를 그대로 사용.
- 이번 변경에는 `wrangler.jsonc`가 없음: 기존 GitHub에서 설정한 실제 D1 ID 보존.

검사 가이드: `evidence/CARD3_LOGIN.md` 참조. `npm test`는 정적 및 모의 검증에 한하며 실제 기기 서명·로그아웃·재사용 거절은 배포 후 Network 및 D1으로 직접 확인해야 합니다.

### 이전 카드 2 변경 사항 (T08-C19~C26)

- 공개 화면에서 가상 이름과 패스키 이름을 입력하고 WebAuthn 등록을 시작합니다.
- 서버가 서로 다른 등록 challenge를 발급하고 D1에는 **challenge의 SHA-256 해시**를 5분간 보관합니다.
- 브라우저의 `navigator.credentials.create()`를 통해 기기에서 패스키를 생성합니다.
- 서버는 `@simplewebauthn/server@14.0.3`로 challenge, Origin, RP ID, 사용자 검증을 확인합니다.
- 검증 후에만 D1 `users`와 `passkeys`에 가입 정보와 **공개키 BLOB**을 저장합니다.
- 등록 취소 시 미완료 challenge를 삭제하고 사용자/패스키 레코드는 생성하지 않습니다.
- 기존 사용자에게 두 번째 패스키 추가는 **유효한 로그인 세션이 있는 경우에만** 가능합니다. 로그인은 카드 3에서 구현했습니다.
- 카드 2에서는 등록 자체는 세션을 발급하지 않습니다. 카드 3의 별도 패스키 로그인에 성공해야 비공개 API를 열 수 있습니다.

### 사용자가 선택한 개발 방식: GitHub 웹 편집 + Cloudflare 대시보드 (로컬 필요 없음)

1. **D1 SQL 먼저 실행:** Cloudflare → `Storage & Databases → D1 → t08-passkey-db → Console` → GitHub `migrations/0002_registration_metadata.sql` 내용 **처음 한 번만** 실행.
2. `PRAGMA table_info(challenges);` → 새 열 4개 확인.
3. GitHub 웹에서 이 패키지의 수정/추가된 파일을 `T08_passkey_myspace/`에 반영하고 `main`에 Commit.
4. Cloudflare Workers GitHub 자동 배포가 성공했는지 확인.
5. `https://t08-passkey-myspace.nalzzoaleph26.workers.dev/` → MY SPACE → 첫 번째 패스키 등록.
6. D1 Console에서 `evidence/CARD2_REGISTRATION.md`의 SQL을 실행해 공개키 보관과 레이블 확인.
7. 등록 취소 테스트와 등록 전/후 `users`, `passkeys` 레코드 건수 검사를 수행.

**중요:** `wrangler.jsonc`는 실제 D1 Database ID가 설정된 **현재 GitHub 버전을 그대로 유지하세요**. 이전 ZIP에 포함된 임시 UUID가 있는 `wrangler.jsonc`를 다시 업로드하지 마세요. 같은 이유로 기존 T01 이미지 파일도 교체할 필요가 없습니다.

### GitHub 웹에서 수정/추가하는 파일 (7개)

```text
T08_passkey_myspace/
├── package.json                             # 수정: SimpleWebAuthn 서버 의존성
├── src/index.js                             # 수정: 등록 API 라우트 연결
├── src/registration.js                      # 새 파일: 등록 challenge/검증/DB 저장
├── public/index.html                        # 수정: 등록 입력창
├── public/myspace.js                        # 수정: WebAuthn 생성 및 요청
├── public/styles.css                        # 수정: 등록 폼 디자인
└── migrations/0002_registration_metadata.sql # 새 파일: D1 신규 열 4개
```

증거 기록을 위해 `evidence/CARD2_REGISTRATION.md`도 추가하는 것이 좋습니다(권장).

### 보안 경계

- 개인키는 브라우저/인증 장치가 보유합니다. 서버 DB와 GitHub에는 저장하지 않습니다.
- WebAuthn challenge 서명/Origin/RP ID 검증을 서버에서 실행하기 **전에는** 계정/공개키를 생성하지 않습니다.
- 등록이 끝나도 인증된 로그인 세션을 발급하지 않습니다.
- 가입 폼은 가상 이름만 받습니다. 개인정보, 비밀번호, 비밀 토큰은 넣지 마세요.
- HTTPS(개발 목적 localhost 예외)에서만 WebAuthn을 진행하며 API의 상태 변경 요청은 동일 Origin POST만 허용합니다.
- 실제 서비스의 무차별 가입, 요청 속도 제한 및 계정 복구 정책은 추가 작업이 필요합니다.

### 파일 역할

- `public/index.html`, `styles.css`, `script.js`: T01 소개 + MY SPACE UI
- `public/myspace.js`: 패스키 등록 팝업, 취소, 비로그인 401 검사
- `src/registration.js`: 패스키 등록/취소 API. 개인키를 요청하거나 저장하지 않음
- `src/index.js`: Cloudflare Workers 라우팅, 세션 확인, 비공개 자료 API 차단
- `migrations/0001_init.sql`: 기존 D1 5개 테이블(이미 적용)
- `migrations/0002_registration_metadata.sql`: 등록 메타데이터 추가(한 번만 적용)
- `evidence/CARD2_REGISTRATION.md`: 검증 기록 양식

### 이번 카드의 미검증 항목

실제 Cloudflare 배포 및 사용자 기기의 WebAuthn 등록 테스트는 별도로 해야 합니다. 로컬 Node 문법/정적 검사가 통과해도 C19~C26을 PASS로 미리 판정하지 않습니다.

현재 완료하지 않은 기능: 패스키 삭제/목록, 두 계정의 자료 격리 실제 검증, 비공개 자료 세 건의 실제 등록. 실제 로그인 및 로그아웃은 배포 환경에서 직접 확인해야 합니다.
