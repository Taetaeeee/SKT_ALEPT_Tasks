# T08 인증 구현 설명서

## ① 무엇으로 붙였나

T01 정적 소개 페이지를 복제·유지하면서 Cloudflare Workers의 서버 API와 Cloudflare D1을 추가했습니다. **WebAuthn 패스키 인증**은 `@simplewebauthn/server` 라이브러리(프로젝트 코드 기준 14.0.3)로 등록·로그인 응답을 검증하며, 브라우저는 WebAuthn API(`navigator.credentials.create/get`)를 사용합니다. 테스트 패스키는 Bitwarden과 Proton Pass 같은 패스키 관리자에 저장했습니다. **웹사이트 비밀번호를 만들거나 전송하는 로그인 방식은 사용하지 않습니다.**

## ② 왜 그걸 골랐나

기존 T01의 HTML/CSS/JavaScript와 디자인을 보존하기 쉽고, Workers는 공개 페이지와 인증 API를 같은 HTTPS 출처로 제공할 수 있습니다. D1에는 공개키·challenge 해시·세션 해시·가상 비공개 자료를 저장할 수 있습니다. 검증 라이브러리를 사용해 WebAuthn 서명·challenge·Origin·RP ID 검사를 직접 암호 알고리즘부터 작성하는 위험을 줄였습니다. 로컬 개발을 전제로 하지 않고 **GitHub 웹 편집 → Cloudflare 자동 배포 → D1 Console 검사**로 구현했습니다.

## ③ 어디를 어떻게 고쳤나

- **공개 페이지와 화면:** `public/index.html`, `public/styles.css`, `public/script.js`에서 기존 T01 내용을 유지하고 MY SPACE를 추가했습니다. 화면 이벤트 코드는 `public/myspace.js`, `public/auth-ui.js`, `public/passkey-manager.js`에 분리했습니다.
- **패스키 등록:** `public/myspace.js` → `POST /api/passkeys/register/options` → `src/index.js` → `src/registration.js` → `POST /api/passkeys/register/verify`. 서버가 등록 challenge를 발급하고 `challenges.challenge_hash`에 SHA-256 해시를 보관합니다. 검증 성공 후 `passkeys.public_key`에 공개키 BLOB을 기록합니다. 취소는 `/api/passkeys/register/cancel`에서 처리합니다. 기존 계정에 패스키를 추가하려면 인증된 세션이 필요합니다.
- **패스키 로그인:** `public/auth-ui.js` → `POST /api/passkeys/login/options` 및 `/verify` → `src/authentication.js`. 새로운 challenge를 생성하고, 등록된 Credential ID의 공개키로 서명과 WebAuthn 인증 조건을 검증합니다. challenge는 1회용이며, 검증 성공 시에만 무작위 세션 토큰을 발급합니다. D1에는 세션 토큰의 **SHA-256 해시**를 저장합니다.
- **로그아웃:** `public/auth-ui.js` → `POST /api/auth/logout` → `src/authentication.js`의 `logout()`. 세션 해시의 DB 행을 삭제하고 `t08_session` 쿠키를 만료시킵니다.
- **비공개 자료 조회와 계정 분리:** `public/auth-ui.js` → `GET /api/private/items` 또는 `GET /api/private/items/{id}` → `src/index.js`의 `verifiedUserId()`. 유효한 서버 세션에서 구한 `user_id`를 `private_items.owner_id`와 비교해서 조회합니다. 요청 URL의 `user_id`, `owner_id` 값은 조회 권한으로 사용하지 않습니다. 상대방 자료 ID는 404로 거절합니다.
- **패스키 삭제·마지막 수단 보호:** `public/passkey-manager.js` → `GET /api/passkeys/manage`, `POST /api/passkeys/manage/delete` → `src/passkey-management.js`. 본인 계정·최근 로그인 여부를 확인하고, 한 SQL 문장으로 마지막 1개 삭제를 막습니다. 삭제 성공 시 해당 계정의 모든 세션을 폐기합니다.

서버 쿠키는 `HttpOnly; Secure; SameSite=Strict`이며 유효기간은 12시간입니다. 등록·로그인 challenge는 5분 동안 유효하도록 설계했습니다. 개인키는 사이트의 D1이나 GitHub에 저장하지 않습니다.

## ④ 안 열리는 것을 확인한 기록

아래는 Cloudflare Workers 실제 배포 주소에서 사용자가 Edge 개발자 도구와 D1 Console로 확인한 내용입니다. 토큰·서명·Cookie 원문을 포함하지 않습니다.

| 확인 항목 | 정상/허용 요청 | 거절 요청 및 응답 |
|---|---|---|
| 비로그인 접근 | 패스키 로그인 상태 `GET /api/private/items` → **200**, 본인 자료 3건 | Edge InPrivate에서 같은 API 직접 요청 → **401**, `unauthorized` / `패스키 인증이 필요합니다.` |
| 다른 계정 자료 | `testA`→본인 자료 **200**, `testB`→본인 자료 **200** | `testA`→`testB` 자료 **404** `not_found`; `testB`→`testA` 자료 **404** `not_found` |
| 한 번 쓴 challenge 재사용 | 새로운 로그인 `POST /api/passkeys/login/verify` → **200**, `authenticated:true` | 동일 `verify` 재전송 → **409 Conflict**. 서버 소스는 `challenge_expired_or_used`로 거절하도록 구현 |
| 삭제 패스키 사용 | 삭제 후 남은 `Backup-Key`로 `testA` 로그인 성공 | 삭제된 `My-PC`로 새 로그인 → `POST /api/passkeys/login/verify` **401**, `authentication_failed` |
| 잘못된 서명 | 원본 로그인 서명 → **200** | 새 challenge에서 서명 문자열 일부 변조 → **401**, `authentication_failed` |
| 로그아웃 | 로그인 상태의 `GET /api/private/items` → **200** | `POST /api/auth/logout` → **200**, 이후 `GET /api/private/items` → **401**. D1 유효 세션 수 `testA` **1 → 0** |
| 계정 ID 변조 | `testB` 로그인 시 자기 자료 3건 → **200** | URL에 실제 `testA`의 ID를 `user_id`, `owner_id`로 추가해도 **testB 자료 3건만** 반환 |

등록용 `challenge` 응답은 서로 달랐고, 서버의 `challenges` 레코드에 해시 길이 64, 소비 처리된 기록을 확인했습니다. `testA`와 `testB`의 저장 공개키는 각 77바이트였고 공개키 접두부(예: `A5010203262001215820…`)도 확인했습니다. 등록 `verify` Payload에는 Credential ID, `clientDataJSON`, `attestationObject`, `publicKey` 등이 있었지만 개인키 필드는 없었습니다. 등록 취소 테스트에서는 계정과 패스키 건수가 증가하지 않았습니다.

공개 소개 페이지를 새 InPrivate 창에서 열어 HTML 소스에서 계정 A/B의 가상 자료 제목 6개와 일부 본문을 검색했을 때 모두 0건이었습니다. 비공개 자료는 실제 D1에 `testA` 3건, `testB` 3건이며, 접근 차단 시험 전후에도 두 계정 모두 3건을 유지했습니다.

**증거 상태를 정확히 구분:** C33의 서버 세션 폐기(DB 1→0)와 로그아웃 후 접근 401은 검증했지만, **로그아웃 전과 완전히 동일한 `t08_session` 쿠키 원문을 재전송해 401을 받았다는 독립 증거는 아직 미확보**입니다. 세션 원문을 제출하지 않는 방식으로 추가 확인이 필요합니다.

## ⑤ AI와 나

- **AI에게 맡긴 일:** Workers/D1 데이터 구조와 WebAuthn 등록·로그인·삭제 코드 초안, 테스트 절차와 문서 초안 작성.
- **내가 직접 판단한 일:** T01 디자인 유지, GitHub 웹 편집과 Cloudflare 대시보드 사용, 가상 자료만 저장, Bitwarden과 별도 관리자에 패스키를 두어 실제 삭제·복구 검증.
- **AI 제안을 따르지 않은 일:** 로컬 PC·PowerShell·Wrangler 설치를 우선하는 방식을 채택하지 않고, 기존 과제 작업 방식인 GitHub 웹 수정과 Cloudflare 자동 배포를 선택함.

## ⑥ 아직 못 막은 것

1. **모든 패스키를 잃어버린 경우의 계정 복구:** 현재는 웹사이트 비밀번호 복구나 관리자 확인을 통한 계정 복구 기능이 없습니다. 마지막 패스키 삭제는 차단하지만, 저장소·기기 자체를 모두 잃으면 접근할 수 없습니다.
2. **등록/로그인 요청의 별도 속도 제한:** challenge 만료·1회용 처리는 구현했지만, IP·계정 기준의 정교한 발급 횟수 제한이나 남용 탐지 정책은 추가 검토가 필요합니다.
3. **복구 증거 범위:** 브라우저에서 원본 세션 쿠키가 완전히 동일하게 재전송된 HTTP 거절 증거(C33)는 아직 미확보입니다. DB 삭제와 401 차단 결과는 확인했으나 이 조건과 혼동하지 않습니다.

> 제출 시 캡처에는 세션 쿠키, 인증 서명·challenge 전체값, 비밀번호 관리자 복구 코드, API 토큰 원문을 넣지 않습니다. 브라우저에 실제 토큰이 표시된 경우 가림 처리 후 첨부합니다.
