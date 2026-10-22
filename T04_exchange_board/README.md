# 오늘의 생활 환율 — T04

실제 공개 환율을 단순 숫자가 아니라 **여행·직구·해외결제·미국주식의 생활 비용으로 해석하는 실시간 환율 정보판**입니다.

## 바로 보기

- **결과물**: https://taetaeeee.github.io/SKT_ALEPT_Tasks/T04_exchange_board/
- **제출 소스(commit 고정)**: https://github.com/Taetaeeee/SKT_ALEPT_Tasks/tree/29d926b0177b74e96b9929f5b8f415faffefbc30/T04_exchange_board

## 주요 기능

- **JPY**: 일본 여행 예산을 현재 환율로 원화 환산
- **CNY**: 중국 직구 상품가·배송비를 원화로 환산
- **USD**: 해외 자격증·서비스 결제, 미국주식 매수·보유자산을 원화로 환산
- **환율 히스토리**: JPY / CNY / USD의 1개월·3개월·1년·5년 흐름과 기간 최저·최신·최고·현재 위치 표시
- **실패 재생**: timeout / 401 / 429 / offline / schema break를 공식 synthetic fixture로 재생
- **복구 확인**: 실패 뒤 마지막 정상값을 `stale`로 유지하고 `T04-RECOVER-D2`로 `fresh / none` 복구
- **실제 이틀 기록**: 서로 다른 KST 날짜의 실제 공개 환율 2건을 보존하고 어제 대비를 재계산

## T04 대표 신호

`jpy-100-krw` — `100 JPY → KRW`

현재 환율 원천의 `KRW`, `JPY` 값을 이용해 다음 규칙으로 정규화합니다.

```text
100 JPY → KRW = rates.KRW / rates.JPY × 100
```

화면에는 다음 정보를 분리해서 표시합니다.

- 정규화 값
- 단위
- 공개 원천
- 원천 관측 시각
- 조회 시각
- 기준 시간대 `Asia/Seoul`

## 데이터 원천

| 용도 | 원천 |
|---|---|
| 현재 환율 | ExchangeRate-API Open Access |
| 과거 참고 시계열 | Frankfurter |
| 장애 재생 | T04 공식 공개 synthetic fixture 9개 |

현재 환율과 과거 그래프는 서로 다른 원천이므로 화면에서도 별도로 표시합니다.

## 실제 이틀 기록

`data/live-records.json`에 실제 공개 원천의 JPY 정규화값을 정확히 2건 보존했습니다.

| KST 날짜 | 100 JPY → KRW | 원천 관측 시각 |
|---|---:|---|
| 2026-09-17 | 880.4595 KRW/100JPY | 2026-09-17 09:02:31 KST |
| 2026-09-18 | 885.8671 KRW/100JPY | 2026-09-18 09:02:31 KST |

두 저장값으로 다시 계산한 어제 대비는 다음과 같습니다.

```text
885.8671 - 880.4595
= +5.4076 KRW/100JPY
= 약 +0.61%
```

화면 표시값도 같은 저장값에서 재계산합니다.

## 실패 처리

공식 fixture로 다음 5가지 외부 실패를 합성 재생합니다.

- `timeout`
- `auth` — upstream 401
- `rate_limit` — 429
- `offline`
- `schema_error`

실패 시 마지막 정상값을 삭제하지 않고 다음 상태를 표시합니다.

```text
freshness = stale
error_code = 실패 종류
```

`T04-RECOVER-D2`를 재생하면 다음 상태로 복구합니다.

```text
freshness = fresh
error_code = none
last value = 120
daily rows = 2
```

합성 fixture 기록은 실제 환율의 일별 기록과 분리되어 있습니다.

## 프로젝트 구조

```text
T04_exchange_board/
├─ index.html
├─ style.css
├─ js/
│  ├─ app.js
│  ├─ calculators.js
│  ├─ history.js
│  ├─ live-records.js
│  ├─ replay.js
│  └─ replay-core.js
├─ data/
│  ├─ current-rates.json
│  └─ live-records.json
├─ fixtures/
├─ scripts/
└─ docs/
```

## 검증

공식 fixture 무결성과 T04 상태를 다음 스크립트로 확인할 수 있습니다.

```bash
node T04_exchange_board/scripts/verify-fixtures.mjs
node T04_exchange_board/scripts/final-audit.mjs --final
```

최종 검사에서는 다음을 확인합니다.

- 공식 fixture 9개의 SHA-256 / 파일 크기
- 실제 일별 기록이 서로 다른 `Asia/Seoul` 날짜 정확히 2건인지
- `raw KRW / JPY`에서 `normalized_value`를 다시 계산해 저장값과 일치하는지
- 필수 파일과 JavaScript 문법
- 비밀값 고신뢰 패턴의 Git 이력 노출 여부

## 제출 상태

T04 최종 제출을 완료했습니다.

- 실제 공개 환율 조회 및 표시
- 공식 5종 실패 합성 재생
- 마지막 정상값 보존 및 `stale` 표시
- `T04-RECOVER-D2` 복구
- 같은 KST 날짜 1행 유지 / 다음 날짜 새 행 생성
- 실제 KST 날짜 2건 보존
- 어제 대비 재계산
- 무로그인 공개 결과물
- 40자리 commit SHA가 포함된 고정 소스 URL 제출

---

> 환율 환산값은 참고용입니다. 실제 카드사·은행·증권사의 적용 환율, 환전 스프레드, 해외결제 수수료, 세금 등에 따라 실제 금액은 달라질 수 있습니다.
