# T08 카드 4 — 패스키 2개 등록·삭제·복구 검증 (C42~C46)

> 이 문서는 **실제 검사를 수행한 뒤** 결과를 채웁니다. 사전 테스트 또는 UI 표시만으로 PASS 처리하지 않습니다.
> 비밀번호, 세션 쿠키, 인증 서명, 패스키 관리자 복구 코드는 저장하거나 제출하지 않습니다.

## 기존 상태(2026-10-21 기준 이전 검증)
- `testA`: `My-PC` 1개
- `testB`: `Test-Key` 1개
- 서로 다른 계정이므로 **현재 C42 미충족**.

## C42 — testA 한 계정에 2개 등록
1. Bitwarden의 `testA / My-PC`로 로그인합니다.
2. MY SPACE 아래 `현재 계정에 패스키 추가`에서 **새 레이블 `Backup-Key`** 입력 후 등록합니다.
   - 가능하면 Proton Pass 등 첫 번째 패스키와 독립된 보관소에 저장합니다.
   - 새 계정이 아니라 기존 로그인 계정 `testA`에 추가되는 기능입니다.
3. `등록된 패스키` 목록에 두 개가 나오는지 확인합니다.
4. 아래 D1 SQL로 `testA` 패스키 건수가 2개인지 확인합니다.
5. **삭제 전에** 로그아웃 → `Backup-Key`로 실제 로그인에 성공하는지 먼저 테스트합니다.

```sql
SELECT u.nickname, p.label,
       datetime(p.registered_at, 'unixepoch', '+9 hours') AS registered_kst,
       length(p.public_key) AS public_key_bytes
FROM passkeys p JOIN users u ON u.id = p.user_id
WHERE u.nickname = 'testA'
ORDER BY p.registered_at, p.credential_id;
```

결과: [실제 출력 기입] / C42: [ ] PASS [ ] FAIL

## C43 — 화면 목록과 날짜
- 로그인 상태에서 `등록된 패스키` 카드 2개 확인. 각 이름·KST 등록일 캡처.
- 로그아웃 상태에서 `GET /api/passkeys/manage`는 401인지 확인.
- **브라우저 목록 응답에 공개키, 개인키, 세션 원문 없음.**

결과: [실제 출력 기입] / C43: [ ] PASS [ ] FAIL

## C44 — 하나 삭제 후 남은 패스키로 로그인
1. **남길 `Backup-Key`가 로그인되는 것을 확인**한 뒤 `testA`로 다시 로그인합니다.
2. 가능하면 로그인 후 10분 안에 기존 `My-PC` 행의 `[삭제]`를 클릭합니다.
3. 확인 대화상자에서 삭제를 승인합니다.
4. HTTP `POST /api/passkeys/manage/delete` → 200 응답, `deleted: true`, `remainingCount: 1`, `loggedOut: true`를 확인합니다.
5. 보안상 모든 세션이 폐기되므로 로그인 화면으로 돌아옵니다.
6. 남은 `Backup-Key`로 다시 로그인해 성공 화면을 남깁니다.
7. 위 SQL로 `testA`에 `Backup-Key` 1개만 남은 것을 확인합니다.

결과: [실제 출력 기입] / C44: [ ] PASS [ ] FAIL

## C45 — 서버에서 삭제된 패스키 로그인 거절
- **Bitwarden 보관함에서 삭제하지 말고**, T08 서버에서만 삭제된 `My-PC` 패스키를 선택해 새 로그인을 시도합니다.
- `POST /api/passkeys/login/verify`가 401 `authentication_failed`로 거절되는지 확인합니다.
- 같은 환경에서 `Backup-Key` 로그인은 200 성공해야 합니다.
- 인증 요청에는 세션·서명 원문을 게시하지 말고 요청 종류와 HTTP 상태·오류 코드만 남깁니다.

결과: [실제 출력 기입] / C45: [ ] PASS [ ] FAIL

## C46 — 마지막 패스키 보호 정책 및 분실 시 안내
- 마지막 1개인 경우 화면의 삭제 버튼이 비활성화됩니다.
- 서버에서도 마지막 1개 삭제를 409 `last_passkey_protected`로 거절합니다(코드/테스트 근거).
- 두 패스키를 모두 **분실**한다면 사이트 비밀번호 로그인/복구 절차가 없어 계정에 접근할 수 없습니다.
- Bitwarden 보관소에 남은 패스키를 삭제하는 것과 T08 서버의 공개키 등록 삭제는 서로 다른 작업입니다.
- 테스트는 실제 계정 접근을 보존하기 위해 마지막 패스키를 삭제하지 않습니다.

결과: [실제 출력 기입] / C46: [ ] PASS [ ] FAIL

## API/소스 근거
- `GET /api/passkeys/manage` → `src/passkey-management.js` (현재 세션 사용자의 이름·등록일만 조회)
- `POST /api/passkeys/manage/delete` → `src/passkey-management.js` (세션 검증, 동일 출처, 최근 10분 로그인, 본인 소유, 마지막 1개 보호, 세션 무효화)
- `src/index.js` → 관리 API 라우팅
- `public/passkey-manager.js` → DOM 목록·삭제 버튼, 삭제 확인창
- `public/auth-ui.js` → 로그인 상태 변경 연동, 삭제 성공 후 잠금 화면으로 복귀
- `src/registration.js` → 기존 계정에 패스키 추가·기존 Credential ID 제외

### 이번 카드에서 변경하지 않은 내용
- T01 기존 소개 글/이미지, D1 Database ID 및 wrangler 설정, 기존 계정/패스키 테이블 값
- D1 스키마 추가 없음 (기존 `passkeys`, `sessions` 사용)

## 아직 못 막은 것 (차후 설명서에 검토)
- 모든 등록 패스키 저장소를 잃어버린 경우 자체 계정 복구 절차가 없습니다.
- 서비스 차원의 사용자당 등록 제한/속도 제한은 추가 검토가 필요합니다.
