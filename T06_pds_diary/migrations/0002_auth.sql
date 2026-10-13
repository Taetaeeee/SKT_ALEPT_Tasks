PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  auth_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

ALTER TABLE plans ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON plans(user_id);

CREATE TABLE IF NOT EXISTS usage_study_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  question TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_unit TEXT NOT NULL,
  calculation_rule TEXT NOT NULL,
  plan_rule TEXT NOT NULL,
  missing_rule TEXT NOT NULL,
  duplicate_rule TEXT NOT NULL,
  outlier_rule TEXT NOT NULL,
  rounding_digits INTEGER NOT NULL DEFAULT 1,
  week_start_day TEXT NOT NULL DEFAULT 'monday',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usage_daily_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  record_date TEXT NOT NULL,
  metric_value REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, record_date)
);
CREATE INDEX IF NOT EXISTS idx_usage_records_user_date ON usage_daily_records(user_id, record_date);

CREATE TABLE IF NOT EXISTS plan_rule_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_rule TEXT NOT NULL,
  new_rule TEXT NOT NULL,
  reason TEXT NOT NULL,
  day1_record_id INTEGER NOT NULL,
  day2_record_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (day1_record_id) REFERENCES usage_daily_records(id),
  FOREIGN KEY (day2_record_id) REFERENCES usage_daily_records(id)
);
