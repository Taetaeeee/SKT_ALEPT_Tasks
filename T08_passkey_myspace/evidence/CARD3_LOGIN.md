# T08 카드 3 — 패스키 로그인/로그아웃 검증 (C27~C35)

> 이 파일은 검증 기록 양식입니다. 자동으로 PASS로 채우지 마세요.
> 실제 응답과 브라우저/Cloudflare D1 화면을 확인한 후 값을 입력하세요.
> 제출물에는 Cookie 헤더, `t08_session`, 서명 원문, 비밀키, 세션 해시, 전체 Credential ID를 게시하지 않습니다.

## 준비

- 공개 화면: https://t08-passkey-myspace.nalzzoaleph26.workers.dev/
- 기존 계정: testA / My-PC (Bitwarden), testB / Test-Key (기 등록)
- 현재 D1: users, passkeys, challenges, sessions, private_items (이미 존재)
- 신규 SQL 마이그레이션: **불필요** (카드 1·2 스키마 재사용)
- 현재 배포본의 `wrangler.jsonc` 값 유지. ZIP에 설정 파일을 넣지 않음.

## ① C27·C28 — 로그인 challenge 2개 비교

1. 로그아웃 상태로 F12 → Network → Keep log 켜기.
2. [패스키로 로그인] 클릭하여 `/api/passkeys/login/options` 응답의 `options.challenge` 기록 후 창 취소.
3. 다시 [패스키로 로그인] 클릭해 새로운 `options.challenge` 기록 후 창 취소.
4. 두 값이 다르면 PASS. challenge는 일부만 증거에 노출하거나 마스킹.

첫 요청: HTTP ___ / challenge 접두부 ___ / transactionId 마스킹 ___
둘째 요청: HTTP ___ / challenge 접두부 ___ / 결과 PASS/FAIL ___

## ② C29·C30 — 서버 공개키 서명 성공·실패

성공: 기존 testA의 Bitwarden 패스키 선택 → `/api/passkeys/login/verify` HTTP 200 → `authenticated: true`.
실패: 브라우저 DevTools Network의 `/api/passkeys/login/verify` 요청을 `편집 후 다시 보내기`(지원 시)로 복사해 테스트용 **새 challenge에 대한** 서명을 변조하여 HTTP 401이 되는지 확인. 단순한 오류는 400일 수도 있으므로 C30 증거에는 실제 서명 검증까지 도달한 입력의 실패 기록을 넣어야 합니다. 민감한 값을 외부로 보내지 마세요.

성공 응답: 상태 ___ / 응답에서 세션 쿠키는 마스킹 ___
실패 응답: 상태 ___ / error ___

## ③ C31 — 사용한 challenge 재사용

- 브라우저에서 성공한 `/api/passkeys/login/verify` 요청의 네트워크 기록을 남김.
- 같은 `transactionId`와 동일한 assertion으로 *다시 전송* (Network의 `Edit and resend` 기능 등이 가능하면 활용).
- 기대: HTTP **409** `challenge_expired_or_used`.
- 서버는 먼저 `UPDATE challenges SET consumed_at = ? ... consumed_at IS NULL`을 수행하기 때문에 인증 시도를 두 번 성공시키지 않음.
- 재전송 내용 중 Credential ID/서명/쿠키 원문은 제출하지 마세요.

재사용 응답: 상태 ___ / error ___

## ④ C32·C33·C34 — 로그인 세션, 로그아웃 후 거절

- 세션 방식: 32바이트 난수 세션을 `t08_session` 쿠키에 저장; D1 `sessions`에는 **SHA-256 해시**만 저장.
- 쿠키: `HttpOnly; Secure; SameSite=Strict; Path=/`, 만료 **12시간**.
- 로그인 뒤 `GET /api/private/items`: HTTP 200 (아직 데이터가 없으면 `items: []`).
- [로그아웃] 누름: `POST /api/auth/logout` HTTP 200. DB에서 세션 해시 삭제, 쿠키 만료.
- 같은 `GET /api/private/items`: HTTP 401. 별도로 **로그아웃 전과 동일한 쿠키를 재전송해도** 401이어야 C33의 강한 증거임(비밀 쿠키 값은 화면에서 가림).
- 제출 시 세션 및 쿠키 값은 `[REDACTED]`로 마스킹.

로그인 성공 API: ___ / 로그아웃 성공 API: ___ / 로그아웃 후 401: ___

## ⑤ C35 — 비밀번호 입력란 없음

- 공개 페이지의 소스(`public/index.html`)에 `type="password"` 입력란 0건.
- 로그인과 패스키 등록은 WebAuthn으로 진행하며 T08 자체 비밀번호를 요청하지 않음.
- Bitwarden 마스터 비밀번호 또는 기기 PIN은 패스키 관리자 잠금 해제 수단이며 T08 사이트 계정 비밀번호가 아님.

## ⑥ 재현 근거 및 남은 위험

- 등록/로그인에는 반드시 HTTPS Origin 검증과 RP ID 검증을 적용.
- 실제 암호학적 검증은 `@simplewebauthn/server@14.0.3`을 사용.
- 남은 위험: 로그인 시도 속도 제한, 관리형 계정 복구 등은 미구현. 비정상 트래픽 방어가 약함.
- D1의 `private_items` 3건은 **실제 개인정보가 아닌 가상 자료로 이후 단계에서 직접 입력**하고, GitHub 공개 소스에 본문을 넣지 않음.

### 검사 결과 요약 (검증 뒤 기록)

| 기준 | 근거 | 상태 |
|---|---|---|
| C27 | 로그인 옵션이 새로운 challenge 발급 | 대기 |
| C28 | 두 옵션 응답의 challenge 비교 | 대기 |
| C29 | 저장된 공개키로 WebAuthn 검증 | 대기 |
| C30 | 정상 서명 성공 / 변조 서명 거절 | 대기 |
| C31 | 같은 요청 재사용 409 | 대기 |
| C32 | 세션 방식과 만료 설명 | 코드 구현, 실증 대기 |
| C33 | 로그아웃 후 같은 세션 거절 | 대기 |
| C34 | 제출 로그 비밀값 마스킹 | 대기 |
| C35 | 비밀번호 입력란 없음 | 소스 검사 대기 |
