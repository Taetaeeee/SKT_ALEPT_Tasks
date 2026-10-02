PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  start_date TEXT NOT NULL CHECK(start_date GLOB '????-??-??'),
  end_date TEXT NOT NULL CHECK(end_date GLOB '????-??-??'),
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  success_criteria TEXT NOT NULL CHECK(length(trim(success_criteria)) BETWEEN 1 AND 1000),
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes >= 0),
  carryover_text TEXT,
  source_reflection_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS plan_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  revision_no INTEGER NOT NULL CHECK(revision_no >= 1),
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  carryover_text TEXT,
  saved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  UNIQUE(plan_id, revision_no)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
  due_date TEXT NOT NULL CHECK(due_date GLOB '????-??-??'),
  priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
  tag TEXT NOT NULL DEFAULT '' CHECK(length(tag) <= 50),
  estimated_minutes INTEGER NOT NULL CHECK(estimated_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_plan_active ON tasks(plan_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  actual_minutes INTEGER NOT NULL CHECK(actual_minutes >= 0),
  blocker_reason TEXT NOT NULL DEFAULT '' CHECK(length(blocker_reason) <= 2000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CHECK(started_at <= ended_at)
);

CREATE INDEX IF NOT EXISTS idx_execution_task ON execution_logs(task_id);

CREATE TABLE IF NOT EXISTS completion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL UNIQUE,
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL UNIQUE,
  insight TEXT NOT NULL DEFAULT '' CHECK(length(insight) <= 3000),
  next_improvement TEXT NOT NULL DEFAULT '' CHECK(length(next_improvement) <= 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS carryovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_plan_id INTEGER NOT NULL,
  source_reflection_id INTEGER NOT NULL,
  target_plan_id INTEGER,
  content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (source_plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  FOREIGN KEY (source_reflection_id) REFERENCES reflections(id) ON DELETE CASCADE,
  FOREIGN KEY (target_plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_revisions_plan ON plan_revisions(plan_id, revision_no);
CREATE INDEX IF NOT EXISTS idx_carryovers_source ON carryovers(source_plan_id);
