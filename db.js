const Database = require("better-sqlite3");

function createDb(dbPath = "app.db") {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  function hasColumn(tableName, columnName) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some((column) => column.name === columnName);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      subscription_status TEXT NOT NULL DEFAULT 'inactive',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      alerts_quota INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alert_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      retailer TEXT NOT NULL,
      product_url TEXT NOT NULL,
      channel_type TEXT NOT NULL DEFAULT 'discord',
      channel_value TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      last_scan_status TEXT NOT NULL DEFAULT 'unknown',
      last_scan_at TEXT,
      last_alerted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_target_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(alert_target_id) REFERENCES alert_targets(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  if (!hasColumn("users", "discord_webhook")) {
    db.exec("ALTER TABLE users ADD COLUMN discord_webhook TEXT");
  }
  if (!hasColumn("alert_targets", "last_scan_status")) {
    db.exec("ALTER TABLE alert_targets ADD COLUMN last_scan_status TEXT NOT NULL DEFAULT 'unknown'");
  }
  if (!hasColumn("alert_targets", "last_scan_at")) {
    db.exec("ALTER TABLE alert_targets ADD COLUMN last_scan_at TEXT");
  }
  if (!hasColumn("alert_targets", "last_alerted_at")) {
    db.exec("ALTER TABLE alert_targets ADD COLUMN last_alerted_at TEXT");
  }

  return db;
}

module.exports = { createDb };
