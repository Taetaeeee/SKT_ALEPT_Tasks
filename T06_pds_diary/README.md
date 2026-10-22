# T06 PDS Diary — 플랜두씨 다이어리 1

> **PLAN → DO → SEE → NEXT PLAN**  
> 계획한 시간과 실제 수행 시간을 비교하고, 돌아보기에서 얻은 개선점을 다음 계획으로 이어가는 개인 PDS 다이어리입니다.

## 바로가기

- 결과물: https://t06-pds-diary.nalzzoaleph26.workers.dev
- 소스: https://github.com/Taetaeeee/SKT_ALEPT_Tasks/tree/main/T06_pds_diary

> **공개 안내**  
> 지금은 로그인이 없어 링크를 아는 사람은 누구나 볼 수 있습니다. 남이 봐도 괜찮은 내용만 넣으세요.

---

## 프로젝트 개요

T06 과제의 핵심인 **계획(Plan) → 실제 수행(Do) → 돌아보기(See)** 흐름을 하나의 웹앱으로 구현했습니다.

계획과 할 일, 실행 기록, 돌아보기 데이터는 브라우저 임시 저장소가 아니라 **Cloudflare D1(SQLite) 서버 데이터베이스**에 저장됩니다. 새로고침 후에도 동일한 데이터가 복원되며, 계획 수정 전 값과 완료/되돌리기 이력도 별도로 보존합니다.

## 기술 구성

| 구분 | 사용 기술 |
|---|---|
| Frontend | HTML / CSS / JavaScript |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Deployment | Cloudflare Workers |
| Repository | GitHub |

구조는 다음과 같습니다.

```text
Browser
   ↓
Cloudflare Worker API
   ↓
Cloudflare D1 (SQLite)
```

## 주요 기능

### PLAN — 계획

- 계획 생성·조회·수정
- 기간, 우선순위, 성공 기준, 예상 시간 저장
- 계획 수정 전 값을 `plan_revisions`에 보존
- SEE에서 정한 개선점을 다음 PLAN 입력 화면으로 전달

### TODO — 할 일

- 할 일 생성·수정·삭제
- 완료 처리 및 진행 중으로 되돌리기
- 마감일, 우선순위, 태그, 예상 시간 저장
- 제목/태그 검색
- 상태·우선순위·태그 필터
- 정렬 기준을 화면에 표시하고 동일 기준으로 정렬
- 삭제는 `deleted_at`을 사용하는 soft delete 방식

### DO — 실제 수행

- 대상 할 일별 시작 시각·끝난 시각 기록
- 실제 소요시간 자동 계산
- 막혔던 이유 기록
- 실행 기록을 저장해도 원래 예상 시간은 유지
- 할 일 변경 시 이전 실행 입력값 자동 초기화

### 완료 중복 방지

`completion_events`의 활성 완료 이벤트에 partial unique index를 적용해 같은 할 일의 완료 기록이 중복 생성되지 않도록 했습니다.

완료 → 진행 중 되돌리기 → 다시 완료 흐름도 이력으로 보존됩니다.

### SEE — 돌아보기

다음 값을 계획별로 집계합니다.

- 계획 수
- 완료 수
- 지연 수
- 막힘 수
- 예상 시간
- 실제 시간
- 실제 시간 - 예상 시간 차이

각 집계 숫자를 클릭하면 **그 숫자가 나온 실제 근거 기록**을 확인할 수 있습니다.

### 데이터 내보내기

상단의 **내 자료 내보내기** 버튼을 누르면 다음 데이터를 JSON 파일 하나로 내려받을 수 있습니다.

```text
plans
plan_revisions
tasks
execution_logs
completion_events
reflections
carryovers
```

파일명 형식:

```text
pds-diary-export-YYYY-MM-DD.json
```

삭제한 할 일과 되돌린 완료 이벤트도 저장 이력 보존을 위해 내보내기에 포함합니다.

---

## 실제 입력 데이터 및 검증 결과

최종 검증 당시 실제 T06 진행 기록을 사용했습니다.

| 항목 | 확인 결과 |
|---|---:|
| 현재 계획 | T06 플랜두씨 다이어리 완성 |
| 현재 예상 시간 | 620분 |
| 수정 전 예상 시간 | 600분 |
| 유효 할 일 | 5개 |
| 완료 할 일 | 2개 |
| 실행 기록 | 3개 |
| 막힘이 기록된 할 일 | 2개 |
| 실제 시간 합계 | 133분 |
| 예상 - 실제 차이 | -487분 |

실행 기록 3건의 실제 시간은 **38분, 45분, 50분**으로 저장했으며, 실행 기록과 예상 시간은 서로 분리해 보존했습니다.

## 데이터베이스 구조

```text
plans
 ├─ plan_revisions
 ├─ tasks
 │   ├─ execution_logs
 │   └─ completion_events
 ├─ reflections
 └─ carryovers
```

최종 테이블·필드·관계·날짜 규칙은 다음 파일에도 정리했습니다.

```text
contracts/pds-schema-v2.json
```

## 데이터 규칙

- 날짜: `YYYY-MM-DD`
- 달력 기준: `Asia/Seoul`
- 시각 저장: UTC ISO 8601
- 화면 표시: Asia/Seoul 기준
- 시간 단위: `minutes`
- 할 일 삭제: soft delete (`deleted_at`)
- 실제 수행 기록은 원래 계획/예상 값을 덮어쓰지 않음

---

## 최종 검증

다음 항목을 실제 배포 환경에서 확인했습니다.

- [x] Cloudflare D1 연결
- [x] 계획 생성·수정 및 수정 전 값 보존
- [x] 할 일 CRUD
- [x] 완료 → 진행 중 되돌리기 → 다시 완료
- [x] 완료 버튼 반복 입력 시 활성 완료 기록 1건 유지
- [x] 검색·필터·정렬
- [x] 실행 기록 3건 이상 저장
- [x] SEE 집계값과 직접 계산값 일치
- [x] 집계 숫자 클릭 시 근거 기록 표시
- [x] SEE 개선점을 다음 PLAN으로 전달
- [x] 새로고침 후 D1 데이터 복원
- [x] 전체 데이터 JSON 한 파일 내보내기
- [x] 시크릿/InPrivate 창에서 결과물·소스 주소 공개 확인
- [x] XSS 형태 문자열을 저장해도 실행되지 않고 문자 그대로 표시
- [x] 브라우저 Console 오류 0건 확인
- [x] Network Headers/Response에 비밀값 원문 없음 확인
- [x] T06 Git 커밋 이력에서 API 키·토큰·비밀번호 원문 없음 확인

### XSS 검사 예시

다음 문자열을 테스트용 할 일 제목으로 저장했습니다.

```text
<img src=x onerror=alert('XSS-TEST')>
```

팝업이나 코드 실행 없이 문자열 그대로 표시되는 것을 확인한 뒤 테스트 데이터는 삭제했습니다.

---

## 짧은 확인 방법

1. **어디로 가나요:** https://t06-pds-diary.nalzzoaleph26.workers.dev 로 접속합니다.
2. **세 단계 안에 무엇을 하나요:** 저장된 계획을 선택하고 할 일·실행 기록을 확인한 뒤 SEE의 집계 숫자를 눌러 근거 기록을 확인합니다.
3. **무엇이 보이면 통과인가요:** PLAN·DO·SEE 데이터가 저장되어 있고, 새로고침 후에도 유지되며 집계 숫자를 누르면 해당 근거 기록이 표시되면 통과입니다.
4. **안 될 때는 무엇이 보이나요:** D1 연결 실패 또는 서버 처리 오류 메시지가 표시되어 저장·조회가 정상적으로 이루어지지 않음을 확인할 수 있습니다.

## AI와 내 판단

1. **AI에게 맡긴 일:** D1 데이터베이스 구조, Worker API, PLAN·TODO·DO·SEE 화면 구현과 테스트 방법 초안을 만드는 일을 맡겼습니다.
2. **내가 직접 판단한 일:** 실제 계획과 할 일, 수행 시간, 막혔던 이유, 돌아보기 내용과 다음 계획에 반영할 개선점은 직접 정하고 입력했습니다.
3. **AI 제안을 따르지 않은 일:** 예시로 제안된 수행 시간은 그대로 사용하지 않고 실제로 작업한 시간과 실제로 발생한 오류를 기준으로 기록했습니다.

---

## 폴더 구조

```text
T06_pds_diary/
├─ contracts/
│  └─ pds-schema-v2.json
├─ migrations/
│  └─ 0001_init.sql
├─ public/
│  ├─ app.js
│  ├─ index.html
│  └─ style.css
├─ scripts/
│  └─ seed.sql
├─ src/
│  └─ index.js
├─ README.md
├─ package.json
└─ wrangler.jsonc
```
