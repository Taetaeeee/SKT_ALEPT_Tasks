# T08 최종 제출 입력문

## 결과물 URL

https://t08-passkey-myspace.nalzzoaleph26.workers.dev/

## 소스 URL

https://github.com/Taetaeeee/SKT_ALEPT_Tasks/tree/main/T08_passkey_myspace

## 짧은 확인 방법 — 4줄

1. **어디로 가나요:** 위 HTTPS 결과물 주소의 공개 소개 페이지 하단 `MY SPACE`로 이동합니다.
2. **세 단계 안에 무엇을 하나요:** ① 공개 소개 내용 확인 ② `MY SPACE`의 잠금 안내 확인 ③ `비로그인 접근 검사` 버튼을 누릅니다.
3. **무엇이 보이면 통과인가요:** 공개 소개는 보이지만 비공개 자료 내용은 보이지 않고, 직접 요청에 서버의 HTTP 401 접근 거절 안내가 표시됩니다.
4. **안 될 때는 무엇이 보이나요:** 인증 전 API 요청은 `unauthorized`, 인증 오류는 `authentication_failed`, 존재하지 않거나 다른 계정의 자료는 `not_found`로 안내됩니다.

## AI와 내 판단 — 3줄

1. **AI에게 맡긴 일:** WebAuthn/Workers/D1 구현 초안, 오류 검증 방법, 제출 설명서 초안을 작성하도록 했습니다.
2. **내가 직접 판단한 일:** 기존 T01을 유지하고 가상 자료만 사용했으며, GitHub 웹에서 수정하고 Cloudflare D1·Workers로 실제 테스트하는 방식을 선택했습니다.
3. **AI 말을 따르지 않은 일:** 로컬 PC 설치·터미널 중심 진행 제안 대신 GitHub 웹 편집과 Cloudflare 자동 배포를 선택했습니다.

## 인증 구현 설명서

[`AUTH_EXPLANATION.md`](AUTH_EXPLANATION.md)의 다음 6항목을 제출합니다: ① 무엇으로 붙였나 ② 왜 그걸 골랐나 ③ 어디를 어떻게 고쳤나 ④ 안 열리는 것을 확인한 기록 ⑤ AI와 나 ⑥ 아직 못 막은 것.

## 최종 제출 전 점검

- [ ] 결과물과 소스 URL이 새 InPrivate 창에서 별도 로그인 없이 열리는지 확인
- [ ] T01 공개 소개 내용이 남아 있는지 확인
- [ ] 비로그인 API가 실제 자료가 있어도 401인지 최종 확인
- [ ] `testA`에 패스키 `Backup-Key`·`My-PC-v2` 두 개, `testB`에 `Test-Key` 확인
- [ ] C33 '같은 세션값 재사용' 증거 추가 또는 미확인 상태를 정확히 표기
- [ ] 실제 개인정보·세션값·암호·복구 코드·API 토큰 원문이 없는지 확인
- [ ] 제출 화면에서 요구하는 필드에 맞게 URL과 설명서 및 짧은 확인 문구 입력
