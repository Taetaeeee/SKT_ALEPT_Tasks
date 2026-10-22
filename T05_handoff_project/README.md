# T05 — 대화가 끊겨도 이어지는 프로젝트

T03 카드 스튜디오를 기반으로 **사진 확대·축소 기능**을 추가하고,  
AI A의 작업을 AI B가 인수인계 문서만으로 이어받아 완성한 T05 과제입니다.

## 바로 보기

- 카드 스튜디오: https://taetaeeee.github.io/SKT_ALEPT_Tasks/T05_handoff_project/
- AI 비교 보고서: https://taetaeeee.github.io/SKT_ALEPT_Tasks/T05_handoff_project/report.html
- GitHub 소스: https://github.com/Taetaeeee/SKT_ALEPT_Tasks/tree/main/T05_handoff_project

---

## 개선 기능

기존 T03 카드 스튜디오에 사진 확대·축소 기능을 추가했습니다.

- 기본 확대율: `100%`
- 최소 확대율: `50%`
- 최대 확대율: `200%`
- 확대율 변경 시 미리보기에 즉시 반영
- 확대 상태에서도 사진 위치 조절 가능
- `1:1`, `4:5`, `9:16` 화면비 전환 시 확대율 유지
- 템플릿 저장/불러오기 시 확대율 유지
- JSON 내보내기/가져오기 시 확대율 유지

기존 문구 편집, 사진 위치 조절, 템플릿 CRUD, 잘못된 JSON 거부, PNG 다운로드 기능은 그대로 유지합니다.

---

## 공통 작업 조건

AI A와 AI B에는 같은 고정 검사와 같은 사용 상한을 적용했습니다.

- 시간 상한: 각각 `45분`
- 요청/호출 상한: 각각 `12회`
- 고정 검사: `Z01 ~ Z10`
- 검사 삭제: `0건`
- 검사 완화: `0건`
- 기대값 변경: `0건`

고정 검사의 상세 내용은 [`T05_TESTS.md`](./T05_TESTS.md)에서 확인할 수 있습니다.

---

## 작업 흐름

1. **AI A 시작**
   - T03 기준 소스에서 사진 확대·축소 기능 구현
   - Z01~Z08 PASS
   - Z09~Z10 FAIL 상태에서 작업 중단

2. **AI A 종료·인수인계**
   - `T05_AI_A_HANDOFF.md` 작성
   - 목표, 현재 상태, 실행 명령, 통과 검사, 남은 문제, 다음 행동, 건드리지 말 것의 7개 항목 기록

3. **AI B 시작**
   - 작업 저장소와 `T05_AI_A_HANDOFF.md`만 제공
   - AI A와 다른 서비스 또는 모델 사용
   - 인수인계 내용 누락 없음

4. **AI B 종료**
   - 템플릿과 JSON에서 확대율이 유지되도록 최소 수정
   - Z01~Z10 최종 `10/10 PASS`

5. **학생 직접 검증**
   - Z09 템플릿 저장/불러오기 확인
   - Z10 JSON 내보내기/가져오기 확인

---

## 비교 결과

| 구분 | 실제 작업시간 | 요청/호출 수 | 오류 회차 | 고정 검사 통과 |
|---|---:|---:|---:|---:|
| AI A | 4분 40초 | 1회 | 2회 | 8 / 10 |
| AI B | 17분 | 2회 | 1회 | 10 / 10 |

> 오류 회차는 고정 검사 10개를 한 세트로 실행한 회차 중 하나 이상의 FAIL이 나온 회차 수입니다.

---

## 고정 소스 버전

### AI A
- 시작 소스: `23f4c6e274a8ed1851cbdf0e47623050659278ea`
- 기능 구현 완료 소스: `d78b004bcc04f0f329c048a93bdb1b41e3112741`
- 인수인계 완료 상태: `f12849e40e528a87cb7cea1b361087ac23bcef57`

### AI B
- 시작 소스: `f12849e40e528a87cb7cea1b361087ac23bcef57`
- 종료 소스: `83a7ea986bc6ca3ec709047f02c03f5a5f333714`

---

## 고정 검사 결과

| ID | 검사 항목 | 최종 결과 |
|---|---|---|
| Z01 | 확대 UI 노출 | PASS |
| Z02 | 기본 확대율 100% | PASS |
| Z03 | 100% → 150% 확대 반영 | PASS |
| Z04 | 150% → 50% 축소 반영 | PASS |
| Z05 | 최소 50% 제한 | PASS |
| Z06 | 최대 200% 제한 | PASS |
| Z07 | 확대 후 사진 위치 이동 | PASS |
| Z08 | 화면비 전환 후 확대율 유지 | PASS |
| Z09 | 템플릿 저장/불러오기 후 확대율 유지 | PASS |
| Z10 | JSON 내보내기/가져오기 후 확대율 유지 | PASS |

---

## 실행 방법

별도 패키지 설치나 환경변수는 필요하지 않습니다.

```bash
cd T05_handoff_project
python -m http.server 8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000
```

비교 보고서는 다음 주소에서 확인할 수 있습니다.

```text
http://localhost:8000/report.html
```

---

## 주요 파일

```text
T05_handoff_project/
├─ index.html
├─ style.css
├─ app.js
├─ report.html
├─ README.md
├─ T05_TESTS.md
├─ T05_INITIAL_REQUEST.md
├─ T05_AI_A_RECORD.md
├─ T05_AI_A_TEST_RESULTS.md
└─ T05_AI_A_HANDOFF.md
```

- `index.html` / `style.css` / `app.js` — 카드 스튜디오 실행 소스
- `report.html` — AI A/B 비교 및 최종 제출용 보고서
- `T05_TESTS.md` — 작업 전에 고정한 Z01~Z10 검사
- `T05_INITIAL_REQUEST.md` — AI A/B에 사용할 공통 최초 요청
- `T05_AI_A_RECORD.md` — AI A 작업 시간·호출 수·검사 결과 기록
- `T05_AI_A_TEST_RESULTS.md` — AI A의 Z01~Z10 상세 결과
- `T05_AI_A_HANDOFF.md` — AI A에서 AI B로 전달한 7항목 인수인계 문서

---

## 학생 판단

AI가 제안한 전체 `app.js`가 기존 원본보다 크게 축약되어 기존 기능을 훼손하는 경우에는 해당 파일을 사용하지 않았습니다.  
실제 원본과 변경 지점을 대조한 뒤 필요한 최소 수정만 반영하고, 브라우저에서 Z09와 Z10을 직접 실행해 최종 동작을 확인했습니다.
