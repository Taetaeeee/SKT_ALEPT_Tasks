# 오늘의 생활 환율 — T04

실제 공개 환율을 단순 숫자가 아니라 생활 비용으로 해석하는 정보판입니다.

- **JPY**: 일본 여행 예산
- **CNY**: 중국 직구 상품·배송비
- **USD**: 해외 자격증·서비스 결제, 미국주식 매수·보유자산 환산

## T04 대표 신호

`jpy-100-krw` — `100 JPY → KRW`

실제 공개 원천은 ExchangeRate-API를 사용하며, 값·단위·원천 관측 시각·조회 시각·기준 시간대를 분리해 표시합니다.

## 데이터 원천

- 현재 환율: ExchangeRate-API Open Access
- 과거 참고 시계열: Frankfurter
- 장애 재생: T04 공식 공개 synthetic fixture 9개

과거 그래프와 현재 환율은 서로 다른 원천이므로 화면에서도 별도로 표기합니다.

## 실패 처리

공식 fixture로 다음 5가지를 합성 재생합니다.

- timeout
- upstream 401
- rate limit 429
- offline
- schema break

실패 시 마지막 정상값은 삭제하지 않고 `stale`로 유지합니다. `T04-RECOVER-D2` 재생 후 `fresh / none`으로 복구합니다.

## 실제 이틀 기록

실제 공개 원천의 JPY 정규화값을 `data/live-records.json`에 보존합니다.

- 서로 다른 `Asia/Seoul` 날짜 정확히 2건
- `source_url`
- `source_observed_at`
- `normalized_value`
- `unit`
- `fetched_at`

두 번째 날짜가 보존되면 두 `normalized_value`로 어제 대비 변화량을 다시 계산합니다.

## 검사

```bash
node T04_exchange_board/scripts/verify-fixtures.mjs
node T04_exchange_board/scripts/final-audit.mjs
```

두 번째 실제 날짜까지 확보한 최종 제출 직전:

```bash
node T04_exchange_board/scripts/final-audit.mjs --final
```

세부 체크리스트는 `docs/T04_FINAL_AUDIT.md`, 제출문 초안은 `docs/SUBMISSION_DRAFT.md`를 확인합니다.
