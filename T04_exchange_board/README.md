# T04 오늘의 생활 환율

SKT ALEPT T04 `오늘의 진짜 정보판 — 데이터가 안 올 때` 구현 프로젝트입니다.

## 1차 구현 범위

- ExchangeRate-API Open Access 공개 원천에서 실제 환율 조회
- JPY 100엔 / CNY 1위안 / USD 1달러를 KRW로 정규화해 표시
- 원천 기준 시각과 브라우저 조회 시각을 분리해 표시
- 대표 신호 `jpy-100-krw`의 원자료와 계산 규칙 공개
- 실제 일별 기록용 `data/live-records.json`을 별도로 준비
- 제공된 T04 공개 fixture를 `fixtures/public/`에 포함

## 대표 신호

- `signal_id`: `jpy-100-krw`
- `normalized_value`: `rates.KRW / rates.JPY * 100`
- `unit`: `KRW/100JPY`
- `source_url`: `https://open.er-api.com/v6/latest/USD`
- `record_timezone`: `Asia/Seoul`

## 실행

ES module과 fetch를 사용하므로 `index.html`을 파일로 직접 열기보다 로컬 HTTP 서버 또는 GitHub Pages에서 확인합니다.

```bash
python -m http.server 8000
```

그 후 `http://localhost:8000`으로 접속합니다.

## 다음 구현

1. 오늘 실제 JPY 기록 JSON 생성/내보내기
2. `live-records.json` 실제 2일 기록 표시 및 어제 대비 계산
3. JPY 여행비 / CNY 직구비 / USD 해외결제·미국주식 계산기
4. Frankfurter 과거 환율 그래프
5. 제공 fixture 5종 실패 및 recover 재생
6. T04 전체 조건 최종 검증

## GitHub Pages 안정화 방식

브라우저에서는 먼저 공개 원천을 직접 조회합니다. 브라우저 직접 호출이 CORS·네트워크 문제로 실패하면 `data/current-rates.json`을 대체값으로 읽습니다.

`current-rates.json`은 저장소 루트의 `.github/workflows/t04-update-rates.yml`이 매일 09:20 KST에 API 키 없이 공개 원천을 조회해 갱신합니다. 이 파일은 '현재 표시용 데이터'이며 T04 실제 2일 보존 파일인 `live-records.json`에 자동 추가되지 않습니다.

저장소에 처음 올린 뒤 **Actions → Update public exchange rates → Run workflow**를 한 번 수동 실행하면 fallback 데이터가 생성됩니다.
