PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  carryover_text TEXT,
  source_reflection_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  revision_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  carryover_text TEXT,
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  UNIQUE(plan_id, revision_no)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT,
  priority TEXT NOT NULL,
  tag TEXT,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  blocker_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS completion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reverted_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_completion_active
ON completion_events(task_id)
WHERE reverted_at IS NULL;

CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  insight TEXT,
  next_improvement TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS carryovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_plan_id INTEGER NOT NULL,
  source_reflection_id INTEGER NOT NULL,
  target_plan_id INTEGER,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  FOREIGN KEY (source_plan_id) REFERENCES plans(id),
  FOREIGN KEY (source_reflection_id) REFERENCES reflections(id),
  FOREIGN KEY (target_plan_id) REFERENCES plans(id)
);
