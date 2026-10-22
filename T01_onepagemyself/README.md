# T01 — 나를 소개하는 한 페이지

IT 인프라·네트워크·보안에 대한 관심, 실제 프로젝트 경험, 학습 내용과 취향을 한 페이지에 정리한 개인 소개 사이트입니다.

## 페이지 구성
- 첫 화면: 소개, 관심 분야, 문제 해결 방식, 대표 경험 3개 미리보기
- EXPERIENCE
  - YouTube 댓글 수집 업무 자동화
  - 프린트 토너 신청 시스템 DB 설계
  - Hyperledger Fabric TLS 트러블슈팅
- HOW I WORK: 문제를 다루는 방식
- LEARNING: 학습 기반, 자격, 현재 공부 중인 내용
- ABOUT ME: 만들기·운동·디지털 카메라와 직접 촬영 사진
- PUBLIC EVIDENCE: 각 경험과 연결된 공개 가능한 근거
- 공개 범위: 공개 정보와 비공개 정보를 구분해 표시

## 공개 근거
1. AUTOMATION — 공개 GitHub 저장소
2. DATA FLOW — 실제 `create_table.sql`을 기준으로 정리한 공개용 ERD
3. TROUBLESHOOTING — 실제 Fabric 코드와 Docker Compose 설정을 기준으로 정리한 공개용 구성 근거

## 상호작용과 접근성
- `대표 경험 보기`로 경험 영역 이동
- `공개용 ERD 보기`, `Fabric 구성 근거 보기` 펼치기/접기
- `취향을 조금 더 보기`를 마우스와 키보드로 실행
- 직접 촬영 사진 클릭/키보드 선택 시 확대
- 사진 확대는 `Esc`로 닫기 가능
- `prefers-reduced-motion` 설정 시 애니메이션 최소화
- 본문 바로가기(skip link)와 `:focus-visible` 포커스 표시 적용

## 파일
- `index.html` — 페이지 구조
- `styles.css` — 디자인·반응형·접근성 스타일
- `script.js` — 취향 펼치기·사진 확대 상호작용
- `ucsi_erd.png` — 프린트 토너 신청 시스템 공개용 ERD
- `fabric_evidence.png` — Hyperledger Fabric 공개용 구성 근거
- `camera_collection.png` — 보유 디지털 카메라 사진
- `photo_*.jpg` — 직접 촬영한 사진
- `SUBMISSION_TEMPLATE.md` — 제출용 문구
- `QA.md` — 최종 확인 체크리스트

## 로컬 실행
```bash
python -m http.server 8000
```

## 공개 시 주의
전화번호, 개인 이메일, 상세 주소, 학번·수험번호, 계정 비밀값은 공개하지 않습니다.
공개 저장소와 Git 기록에도 비밀번호·토큰·API Key·인증서 원문을 넣지 않습니다.
