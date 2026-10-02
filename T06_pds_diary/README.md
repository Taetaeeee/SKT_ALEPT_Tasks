# T06 PDS Diary

T06 플랜두씨 다이어리 1 과제용 Cloudflare Workers + D1 프로젝트입니다.

## 현재 구현 범위

- Cloudflare D1 서버 DB 스키마
- PLAN 생성/조회/수정
- PLAN 수정 전 스냅샷(`plan_revisions`) 보존
- 실제 T06 계획과 5개 할 일을 넣는 seed SQL
- 첫 화면의 로그인 없음 공개 안내
- `contracts/pds-schema-v2.json` 초안

DO/SEE 및 할 일 CRUD는 다음 단계에서 연결합니다.

## 1. 설치

```bash
npm install
```

## 2. Cloudflare 로그인

```bash
npx wrangler login
```

## 3. D1 생성

```bash
npx wrangler d1 create t06-pds-diary-db
```

명령 결과의 `database_id`를 `wrangler.jsonc` 안의
`REPLACE_WITH_YOUR_D1_DATABASE_ID` 자리에 넣습니다.

## 4. 로컬 DB 마이그레이션

```bash
npm run db:migrate:local
```

## 5. 로컬 실행

```bash
npm run dev
```

화면의 `서버 DB`가 `D1 연결됨`으로 표시되는지 확인합니다.

## 6. 실제 T06 계획/할 일 입력(로컬)

```bash
npm run db:seed:local
```

새로고침 후 계획 1개와 할 일 5개가 DB에서 복원되는지 확인합니다.

## 7. 원격 DB 마이그레이션 + seed

```bash
npm run db:migrate:remote
npm run db:seed:remote
```

## 8. 배포

```bash
npm run deploy
```

## 현재 단계 확인

1. 첫 화면의 공개 안내 문구가 보인다.
2. 서버 DB가 `D1 연결됨`으로 보인다.
3. PLAN을 저장한 뒤 새로고침해도 남아 있다.
4. PLAN을 수정하면 수정 전 값이 `수정 이력`에 남는다.

## 데이터 규칙

- 날짜: `YYYY-MM-DD`, Asia/Seoul 달력 날짜
- 시각: DB에 UTC ISO 8601
- 시간량: 분(minutes)
- 계획 수정: 기존 행을 덮기 전에 `plan_revisions`에 스냅샷 저장
- 할 일 삭제: `deleted_at`을 이용한 soft delete 예정
- 완료 중복: `completion_events.task_id UNIQUE`로 DB 수준 차단
