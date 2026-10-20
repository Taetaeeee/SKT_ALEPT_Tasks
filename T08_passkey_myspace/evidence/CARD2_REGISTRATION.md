# T08 카드 2 — 패스키 등록 증거(C19~C26)

**실제 패스키 등록 전에는 PASS라고 적지 않습니다.** 계정 이름, 패스키 이름은 가상 이름만 사용하세요. challenge 원문, session/token, credential ID 전체는 공개 제출문에 복사하지 마세요.

## Cloudflare 대시보드 진행 순서

1. `Storage & Databases → D1 → t08-passkey-db → Console`에서 `migrations/0002_registration_metadata.sql`을 **한 번만** 실행합니다.
2. `PRAGMA table_info(challenges);` 조회 → `pending_nickname`, `pending_label`, `pending_user_id`, `rp_origin` 4개 확인.
3. GitHub 웹에서 변경된 파일들을 수정·추가하고 `main`에 Commit → Cloudflare Workers 자동 배포 성공 확인.
4. Workers 공개 URL `https://t08-passkey-myspace.nalzzoaleph26.workers.dev/` → MY SPACE → 가상 이름과 패스키 이름 → `새 패스키 등록`.
5. 기기에서 Windows Hello/스마트폰 등의 사용자가 확인한 저장 위치를 기록. `등록 완료` 문구를 확인.

## 데이터베이스 확인 SQL (공개키(hex)는 공개 가능한 값이며 비밀값이 아님)

```sql
SELECT u.nickname, p.label, p.registered_at,
       length(p.public_key) AS public_key_bytes,
       hex(p.public_key) AS public_key_hex,
       p.counter
FROM passkeys p JOIN users u ON u.id = p.user_id
ORDER BY p.registered_at DESC;
```

```sql
SELECT purpose, count(*) AS issued,
       sum(CASE WHEN consumed_at IS NOT NULL THEN 1 ELSE 0 END) AS consumed
FROM challenges GROUP BY purpose;
```

## 테스트 기록(직접 채우기)

| ID | 검사 | 예상 | 실제 기록 |
|---|---|---|---|
| C19 | 등록 옵션 요청 | `challenge` 서버 생성·해시 보관 | 미검증 |
| C20 | 등록 옵션 요청 2회 | challenge 서로 다름(원문 공개 금지) | 미검증 |
| C21 | 정상 등록 후 D1 조회 | 공개키 BLOB 1개 이상 | 미검증 |
| C22 | DB hex 일부 + 설명 | 공개키이지 비밀번호가 아님 | 미검증 |
| C23 | Network 요청 본문 | `attestationObject`, `clientDataJSON` 등, 개인키 없음 | 미검증 |
| C24 | 패스키 이름 | `label`로 조회 | 미검증 |
| C25 | 기기 팝업 취소 | users/passkeys 건수 불변 | 미검증 |
| C26 | 저장 위치 | 사용자가 기기 표시를 확인한 저장 위치 기재 | 미검증 |

**이번 단계는 등록만 구현합니다.** 로그인/로그아웃·세션 발급은 아직 연결되지 않아 비공개 자료 요청은 여전히 401이어야 합니다.

### 주의/한계

- 새 계정의 첫 패스키 등록은 누구나 시작할 수 있습니다. 실제 개인정보를 등록하지 마세요.
- 등록 요청의 남용·대량 가입을 제한하는 별도의 속도 제한은 아직 구현하지 않았습니다.
- 패스키 등록이 완료되어도 로그인 인증 확인 없이 비공개 자료를 열어서는 안 됩니다.
- D1의 `challenges`에는 등록 challenge의 SHA-256만 저장하며, 브라우저/서버 사이에서 개인키는 전송되지 않습니다.
