const Database = require("better-sqlite3");

function createDb(dbPath = "app.db") {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  return db;
}

module.exports = { createDb };
