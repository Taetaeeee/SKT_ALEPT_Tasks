# T05 AI A → AI B 인수인계

## 1. 목표
T03 카드 스튜디오에 사진 확대·축소 기능을 완성한다. 확대율 범위는 50%~200%, 기본값은 100%다. 미리보기 즉시 반영, 확대 상태에서 사진 위치 조절과 화면비 전환, 템플릿 저장/불러오기 및 JSON 백업/복원까지 확대율을 보존하는 것이 최종 목표다. 고정 검사는 저장소의 `T05_TESTS.md` Z01~Z10이며 삭제·완화·기대값 변경 없이 그대로 사용한다.

## 2. 현재 상태
AI A 시작 소스 버전 ID: `23f4c6e274a8ed1851cbdf0e47623050659278ea`.
AI A 구현 완료 소스 버전 ID: `d78b004bcc04f0f329c048a93bdb1b41e3112741`.
업로드 원본 ZIP SHA-256: `016a998171db402fb4debf81e9c5157652dcd45dc27d0c27faf04ae2f1e8e41d`.
`index.html`에 사진 크기 슬라이더와 확대율 출력이 추가되어 있고, `app.js`에 `state.imageScale`, 50~200 범위 보정, canvas 렌더링 배율 적용, 이미지 새 로드/전체 초기화 시 100% 복귀가 구현되어 있다. Z01~Z08은 통과한다. 템플릿과 JSON에는 확대율이 아직 저장되지 않는다.

## 3. 실행 명령
작업 폴더 `T03_card_studio_v15`에서 `python -m http.server 8000`을 실행한 뒤 브라우저에서 `http://localhost:8000`을 연다. PNG/JPEG 이미지를 불러오고 저장소의 `T05_TESTS.md` 순서대로 Z01~Z10을 실행한다. 별도 패키지 설치나 환경변수는 필요 없다.

## 4. 통과 검사
AI A 마지막 검사 결과는 Z01 PASS, Z02 PASS, Z03 PASS, Z04 PASS, Z05 PASS, Z06 PASS, Z07 PASS, Z08 PASS, Z09 FAIL, Z10 FAIL이다. 총 8/10 PASS다. 마지막 자동 검사 회차의 브라우저 콘솔 오류는 0건이다. 상세 기록은 `T05_AI_A_TEST_RESULTS.md`에 있다.

## 5. 남은 문제
Z09: `buildTemplateSnapshot()`이 `imageScale`을 저장하지 않고 `loadTemplate()`도 저장된 확대율을 복원하지 않아, 150%로 저장한 템플릿을 불러오면 100%가 된다. Z10: JSON 템플릿 검증·가져오기 구조가 `imageScale`을 필드로 다루지 않아 내보내기/가져오기에서 확대율을 보존할 수 없다.

## 6. 다음 행동
`buildTemplateSnapshot()`에 `imageScale`을 추가하고, 기존 저장 데이터 호환을 위해 값이 없으면 100%를 기본값으로 사용한다. `restoreTemplatesFromStorage()`, `loadTemplate()`, `validateTemplateForJson()`, `importTemplatesFromJsonFile()`에 50~200 범위의 `imageScale` 저장·검증·복원을 추가한다. 그 뒤 Z01~Z10 전체를 처음부터 다시 실행하고 10/10 PASS 여부를 기록한다.

## 7. 건드리지 말 것
고정 검사 Z01~Z10의 ID·입력·기대값을 변경하지 않는다. 기존 `imageOffsetX/imageOffsetY` 위치 조절, 문구 편집, 화면비 1:1·4:5·9:16, 템플릿 CRUD, 손상/필수 누락 JSON 거부, PNG 다운로드 동작을 제거하거나 완화하지 않는다. 확대율 범위 50~200%와 기본값 100%도 변경하지 않는다.
