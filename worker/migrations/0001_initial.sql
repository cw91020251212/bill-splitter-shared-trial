CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  document TEXT NOT NULL CHECK (json_valid(document)),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pin_failures (
  bill_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  failed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pin_failures_by_friend_time
  ON pin_failures (bill_id, friend_id, failed_at);
