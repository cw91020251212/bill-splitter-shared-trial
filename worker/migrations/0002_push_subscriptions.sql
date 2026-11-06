CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  subscription_json TEXT NOT NULL CHECK (json_valid(subscription_json)),
  created_at TEXT NOT NULL,
  UNIQUE (bill_id, friend_id)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_by_bill
  ON push_subscriptions (bill_id);
