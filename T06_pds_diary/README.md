# T06 PDS Diary

T06 플랜두씨 다이어리 1 과제용 Cloudflare Workers + D1(SQLite) 프로젝트입니다.

## 구성

- Frontend: HTML / CSS / JavaScript
- Backend: Cloudflare Worker
- Database: Cloudflare D1 (SQLite)
- 공개 범위: 로그인 없음. 링크를 아는 사람은 누구나 접근 가능

## 구현 기능

- PLAN 생성·조회·수정 및 수정 전 스냅샷 보존
- 할 일 CRUD, 완료/되돌리기, 검색·필터·정렬
- DO 시작/끝 시각, 실제 소요시간, 막혔던 이유 기록
- 활성 완료 이벤트 DB 중복 방지
- SEE 계획/완료/지연/막힘/예상/실제/차이 집계
- 집계 숫자 클릭 시 근거 기록 표시
- SEE 개선점을 다음 PLAN으로 전달
- 전체 데이터 JSON 한 파일 내보내기
- `contracts/pds-schema-v2.json`에 표·항목·관계·시간 규칙 기록

## 데이터 규칙

- 날짜: `YYYY-MM-DD`, Asia/Seoul 달력 날짜
- 시각: DB에는 UTC ISO 8601 문자열 저장, 화면은 Asia/Seoul 기준 표시
- 시간량: 분(minutes)
- 할 일 삭제: `deleted_at`을 사용하는 soft delete
- 실행 기록은 원래 예상 시간을 덮어쓰지 않음
- 완료 상태는 `completion_events`의 활성 이벤트를 partial unique index로 중복 방지

## 전체 데이터 내보내기

화면 상단의 **내 자료 내보내기**를 누르면 `pds-diary-export-YYYY-MM-DD.json` 파일을 내려받습니다.
내보내기 파일에는 다음 데이터가 포함됩니다.

- plans
- plan_revisions
- tasks
- execution_logs
- completion_events
- reflections
- carryovers

삭제된 할 일과 되돌린 완료 이벤트도 저장 이력 보존을 위해 파일에 포함됩니다.

## 최종 검사 메모

1. 새 시크릿 창에서 결과물 주소와 GitHub 소스 주소가 로그인 없이 열리는지 확인
2. 계획·할 일·실행 기록·돌아보기를 저장하고 F5 후 같은 값이 복원되는지 확인
3. 집계 숫자를 눌러 근거 기록이 맞는지 확인
4. 내 자료 내보내기로 JSON 파일 1개가 정상 열리는지 확인
5. 스크립트 모양 문자열을 저장해도 실행되지 않고 글자 그대로 보이는지 확인
6. 브라우저 코드·네트워크·콘솔·Git 저장소에서 API 키/토큰/비밀번호 원문이 없는지 확인

## 공개 안내

첫 화면에는 다음 문구를 고정 표시합니다.

> 지금은 로그인이 없어 링크를 아는 사람은 누구나 볼 수 있습니다. 남이 봐도 괜찮은 내용만 넣으세요.
