-- 실제 T06 진행 계획. 원격 DB에서 한 번만 실행하세요.
INSERT INTO plans (
  title, start_date, end_date, priority, success_criteria, estimated_minutes
)
SELECT
  'T06 플랜두씨 다이어리 완성',
  '2026-10-01',
  '2026-10-05',
  'high',
  'T06 필수 기능을 구현하고 완주 체크리스트와 최종 검사를 통과한다.',
  600
WHERE NOT EXISTS (
  SELECT 1 FROM plans WHERE title = 'T06 플랜두씨 다이어리 완성'
);

INSERT INTO tasks (plan_id, title, due_date, priority, tag, estimated_minutes)
SELECT p.id, v.title, v.due_date, v.priority, v.tag, v.minutes
FROM plans p
JOIN (
  SELECT 'DB 및 API 구조 구현' AS title, '2026-10-01' AS due_date, 'high' AS priority, 'backend' AS tag, 120 AS minutes
  UNION ALL SELECT 'PLAN·할 일 관리 구현', '2026-10-02', 'high', 'frontend', 150
  UNION ALL SELECT 'DO 실행 기록 구현', '2026-10-03', 'high', 'feature', 120
  UNION ALL SELECT 'SEE 돌아보기 구현', '2026-10-04', 'high', 'feature', 120
  UNION ALL SELECT '배포 및 최종 검사', '2026-10-05', 'high', 'test', 90
) v
WHERE p.title = 'T06 플랜두씨 다이어리 완성'
  AND NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.plan_id = p.id AND t.title = v.title
  );
