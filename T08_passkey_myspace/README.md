# T08 — 내 소개 페이지에 패스키 달기

> T01 소개 페이지를 유지하고, 서버에서 인증된 사용자에게만 MY SPACE 자료를 제공하는 WebAuthn 패스키 실습 프로젝트입니다.

## 공개 결과물과 소스

- **공개 결과물:** https://t08-passkey-myspace.nalzzoaleph26.workers.dev/
- **소스:** https://github.com/Taetaeeee/SKT_ALEPT_Tasks/tree/main/T08_passkey_myspace
- **기존 T01:** https://taetaeeee.github.io/SKT_ALEPT_Tasks/T01_onepagemyself/

공개 소개 페이지는 로그인 없이 볼 수 있습니다. 비공개 자료와 패스키 관리 화면은 서버에서 세션을 검증한 뒤에만 제공합니다. 심사자는 패스키를 만들거나 비공개 자료에 접근할 필요가 없습니다. 프로젝트의 테스트 계정, 자료 제목·본문은 모두 가상으로 작성했습니다. 실명·연락처·신분증 번호·비밀번호·세션값을 제출하지 않습니다.

## 주요 기능

- 공개 T01 소개 내용과 별도로 `MY SPACE` 잠금 영역 표시
- WebAuthn 패스키 등록, 이름 부여, 등록 취소
- 매 요청마다 서버가 생성하는 일회용 challenge와 D1 해시 보관
- D1 공개키를 이용한 서버 측 서명·Origin·RP ID 검증
- 로그인 후 D1 서버 세션(원문은 브라우저 HttpOnly 쿠키, DB에는 해시), 로그아웃 시 서버 세션 삭제
- 계정별 가상 비공개 자료 3건씩 제공, 타 계정 자료 ID 요청 시 404
- 계정별 패스키 목록, 등록일(KST), 삭제와 남은 패스키로 재로그인
- 마지막 패스키 삭제를 UI와 서버에서 제한 (분실 시 계정 복구 수단 없음)

## 실행 구조

```text
T01 공개 소개 + MY SPACE (public/)
    ├─ public/myspace.js: WebAuthn 등록 UI
    ├─ public/auth-ui.js: 로그인/로그아웃/비공개 조회 UI
    └─ public/passkey-manager.js: 목록/삭제 UI
              │ HTTPS (동일 출처)
              ▼
Cloudflare Workers — src/index.js
    ├─ src/registration.js: 등록 challenge / 공개키 저장
    ├─ src/authentication.js: 로그인 서명 검증 / 세션 발급·폐기
    ├─ src/passkey-management.js: 패스키 조회·삭제 / 마지막 패스키 방어
    └─ 비공개 API: 유효한 세션의 user_id를 owner_id로 조회
              │
              ▼
Cloudflare D1 — users, passkeys, challenges, sessions, private_items
```

## 주요 API

| 동작 | 엔드포인트 | 로그인 필수 |
|---|---|---|
| 등록 옵션 / 응답 검증 / 취소 | `POST /api/passkeys/register/options`, `/verify`, `/cancel` | 첫 계정 생성은 아니오, 기존 계정 추가는 예 |
| 로그인 옵션 / 서명 검증 | `POST /api/passkeys/login/options`, `/verify` | 아니오 |
| 로그아웃 | `POST /api/auth/logout` | 세션 폐기 요청 |
| 로그인 상태 | `GET /api/auth/status` | 아니오 |
| 비공개 목록 / 단건 | `GET /api/private/items`, `/api/private/items/{id}` | 예 |
| 패스키 목록 / 삭제 | `GET /api/passkeys/manage`, `POST /api/passkeys/manage/delete` | 예 |

## 제출용 문서

- [`AUTH_EXPLANATION.md`](AUTH_EXPLANATION.md): 인증 구현 설명서 6항목
- [`SUBMISSION.md`](SUBMISSION.md): 결과물·소스 URL, 확인 방법 4줄, AI와 내 판단 3줄
- [`evidence/T08_FINAL_VERIFICATION.md`](evidence/T08_FINAL_VERIFICATION.md): C번호별 실제 확인한 증거와 남은 점검

## 결과 검증 요약 (2026-10-22)

- `testA` 비공개 자료 3건, `testB` 비공개 자료 3건을 D1에서 확인.
- 패스키 2개(`Backup-Key`, `My-PC-v2`)가 `testA`에, `Test-Key`가 `testB`에 등록된 상태를 확인.
- 인증 전 비공개 API 401, 자기 자료 200, 상대 자료 404, 계정 ID를 URL에 넣어도 자기 자료만 반환됨.
- 정상 로그인 200, 변조 서명 401, 소비된 challenge 재사용 409.
- 로그아웃 전 비공개 조회 200 → 로그아웃 200 → 로그아웃 후 비공개 조회 401; D1 `testA`의 유효 세션 수 1 → 0.
- C33: 로그아웃 전에 사용한 `t08_session`과 **동일한 이전 쿠키값**으로 재요청했지만 401로 거절됨. 사용자가 동일성을 직접 확인했으며 쿠키 원문은 보관·공개하지 않음.
- 마지막 패스키 삭제의 서버 409 차단은 코드/모의 테스트로 확인, 실사용 계정의 마지막 패스키를 위험하게 삭제하는 실험은 하지 않음. 실제 남은 1개 패스키의 삭제 UI 비활성화는 확인함.

## 참고

Cloudflare D1 콘솔로 스키마를 생성·갱신했고, GitHub 웹 편집과 Cloudflare Workers GitHub 자동 배포로 작업했습니다. `wrangler.jsonc`에는 실사용 D1 바인딩 `DB`가 있어야 합니다. 문서 내용은 사용자 테스트에서 확인된 범위이며, 파일 내 테스트 결과는 별도 표기를 따릅니다.
