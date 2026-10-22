# T08 실제 검증 기록 및 남은 검사 (2026-10-22)

> 기준: `T08_과제 안내.txt` / 실제 사용자 캡처 및 D1 조회. 서버 코드 근거와 실제 HTTP 증거를 분리합니다. 이 파일은 증거 **요약문**이며 스크린샷 자체를 포함하지 않습니다.

| C번호 | 확인한 근거 | 상태 |
|---|---|---|
| C13 | 공개 T01 영역 아래 별도 MY SPACE 잠금 카드 표시 | 확인 |
| C14 | D1 `private_items`: testA 3건, testB 3건 | 확인 |
| C15~C17 | 비로그인 잠금 화면; GET `/api/private/items` → 401 | 확인 |
| C18 | InPrivate HTML 소스의 비공개 제목 6개/본문 일부 검색 0건 | 확인 |
| C19 | D1 등록 challenge 해시 길이 64, `consumed_count=1` | 확인 |
| C20 | 등록 options challenge 서로 다른 두 값 | 확인 |
| C21~C22 | D1에 testA/testB의 공개키 77바이트 각각 저장, 공개키 접두부 확인 | 확인 |
| C23 | 등록 verify Payload에 공개키/attestation/clientDataJSON 포함, 개인키 필드 없음 | 확인 |
| C24~C26 | 패스키 이름, 취소 후 0건 증가, Bitwarden 저장 위치 확인 | 확인 |
| C27~C28 | 로그인 options에서 서로 다른 challenge 2개 | 확인 |
| C29~C30 | 정상 verify 200, 신규 challenge에서 변조 서명 verify 401 `authentication_failed` | 확인 |
| C31 | 성공 verify 200, 동일 요청 재전송 409 | 확인 |
| C32 | 서버 세션 해시 + HttpOnly/Secure/SameSite=Strict 쿠키 사용; 코드 확인 | 확인 |
| C33 | 로그인 전후 동일한 **이전 `t08_session` 쿠키값** 재요청 → 401; 로그아웃 전 GET 200, 로그아웃 200, D1 testA 유효 세션 1→0. 사용자가 값 동일성 직접 확인, 값 원문 비공개 | **확인** |
| C34 | 제출할 쿠키/세션 원문은 가림. 향후 캡처 최종 확인 필요 | 제출 직전 검사 |
| C35 | T08 화면에 웹사이트 비밀번호 입력란 없음 | 확인 |
| C36 | testA, testB 서로 다른 가상 자료 3건씩 | 확인 |
| C37~C38 | 각 계정 자기 자료 200, 상대 자료 ID 조회 404 | 확인 |
| C39 | 접근 거절 전후 testA 3건, testB 3건 동일 | 확인 |
| C40 | testB 로그인 후 URL에 testA 실제 user_id/owner_id 입력 → testB 자료 3건만 200 | 확인 |
| C41 | `src/index.js`: `verifiedUserId()`와 private-items 조회 `WHERE owner_id = ?` | 코드 확인 |
| C42~C43 | testA에 패스키 2개 등록·이름·등록일 표시. 현재 Backup-Key, My-PC-v2 | 확인 |
| C44~C45 | My-PC 서버 삭제 후 Backup-Key 로그인 성공; 삭제한 My-PC verify 401 | 확인 |
| C46 | 1개 상태에서 삭제 버튼 비활성화, 0개 시 복구 불가 안내; 서버는 409 방어(코드/모의 테스트) | 기준 충족, 실계정의 마지막 키 삭제 안 함 |
| C01~C03, C10~C12 | URL은 문서에 기재. T01 공개 소개·가상 데이터 고지는 화면과 문서에서 확인. URL 2개가 InPrivate에서 계정 없이 열리는지는 제출 직전 직접 확인 필요; URL **제출 필드 입력**도 아직 검증하지 않음 | 일부 확인/최종 점검 |
| C47~C53 | `AUTH_EXPLANATION.md`, `SUBMISSION.md`에 작성 | 문서 작성 완료, 제출 전 확인 |

## C33 추가 완료 — 로그아웃 후 동일 세션 재사용

- **확인:** 로그인 후 `GET /api/private/items` 200 → `POST /api/auth/logout` 200 → 로그아웃 후 동일 자료 요청 401.
- **확인:** `sessions` 테이블에서 testA의 유효 세션 수가 **1 → 0**.
- **확인:** 기존 요청의 쿠키 이름 `t08_session`을 확인했고, 로그아웃 전 복사한 값과 동일한 이전 쿠키값을 포함해 재요청했을 때 HTTP **401 Unauthorized** 및 `unauthorized`가 반환됨. 쿠키 값 동일성은 실사용자가 직접 비교했으며 전체 값은 증거에 넣지 않음.
- **코드 근거:** `src/authentication.js` `logout()`이 세션 해시의 DB 행을 삭제하고, `src/index.js` `verifiedUserId()`는 DB에 동일한 유효 세션이 없으면 인증을 허용하지 않음.
- **C33 판정:** 실제 응답·DB 결과·사용자 확인을 합쳐 **PASS**. 실세션 값은 최종 문서·공개 저장소에 포함하지 않음.

## 제출용 화면 권장 (인증 비밀은 가림)

1. 공개 소개 + MY SPACE 잠금 카드와 비로그인 401.
2. 등록 options 두 개의 서로 다른 challenge **접두부만** 비교.
3. 공개키 크기와 공개키 접두부, 개인키 필드 없는 Payload 구조.
4. 정상 로그인 200 vs 변조 서명 401, 성공 verify 200 vs 재사용 409.
5. 패스키 2개 이름·등록일 → My-PC 삭제 → Backup-Key 로그인 200 vs My-PC 로그인 401.
6. testA↔testB 각자의 200 / 상대방 404, 계정별 DB 자료 3→3.
7. InPrivate HTML에 비공개 제목 0건, 비로그인 `/api/private/items` 401.
8. 로그아웃 전후 서버 세션 1→0, 자료 조회 200→401, **동일한 이전 세션 쿠키를 재사용한 요청 401**. 인증 쿠키값은 가림 처리.

공개키 식별용 접두부는 제출할 수 있지만, 세션 Cookie·WebAuthn 서명·Bitwarden/Proton Pass 계정 복구 정보·Cloudflare API 토큰은 절대 저장하거나 공유하지 않습니다.

## 최종 제출 단계에서 아직 필요한 확인

- C01·C02: **실제 제출 폼의** 결과물 URL·소스 URL 칸에 각각 HTTPS 주소를 입력해야 합니다. 문서에 URL을 썼다는 것과 제출 폼에 입력하는 것은 구별합니다.
- C03: 배포 주소와 GitHub 소스 주소를 **새 InPrivate 창**에서 로그인·OAuth·CAPTCHA·초대 없이 열어 봅니다. GitHub 저장소 공개 여부도 직접 확인합니다.
- C34: README·설명서·요약뿐 아니라 GitHub에 실제 업로드하는 **모든 캡처와 코드**에서 쿠키·세션 원문·Cloudflare API 토큰·비밀번호 관리자 복구 정보를 가렸는지 재검토합니다.
- C47~C53: 문서 내용은 작성됐지만, 실제 제출 화면에 해당 설명과 4줄/3줄 항목을 제출해야 완료입니다.

**최종 상태:** C33 검사는 2026-10-22에 추가 확인하여 통과. 남은 것은 공개 링크 및 제출 화면 입력, 증거 마스킹 최종 검사입니다.
