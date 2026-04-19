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

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical_name TEXT NOT NULL,
      set_name TEXT,
      product_type TEXT,
      image_url TEXT,
      brand TEXT,
      release_date TEXT,
      canonical_slug TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS retailers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      base_url TEXT,
      adapter_key TEXT UNIQUE NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      retailer_id INTEGER NOT NULL,
      retailer_sku TEXT,
      product_url TEXT NOT NULL UNIQUE,
      last_seen_price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      current_state TEXT NOT NULL DEFAULT 'UNKNOWN',
      last_seen_at TEXT,
      last_in_stock_at TEXT,
      confidence_score REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id),
      FOREIGN KEY(retailer_id) REFERENCES retailers(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_offer_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      old_state TEXT,
      new_state TEXT,
      old_price REAL,
      new_price REAL,
      raw_snapshot_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_offer_id) REFERENCES product_offers(id)
    );

    CREATE TABLE IF NOT EXISTS monitor_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adapter_key TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      requests_made INTEGER NOT NULL DEFAULT 0,
      errors_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      retailer_scope TEXT,
      alert_channels TEXT,
      price_cap REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS release_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      set_name TEXT,
      release_date TEXT NOT NULL,
      notes TEXT,
      source_url TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_alert_preferences (
      user_id INTEGER PRIMARY KEY,
      discord_enabled INTEGER NOT NULL DEFAULT 1,
      email_enabled INTEGER NOT NULL DEFAULT 0,
      sms_enabled INTEGER NOT NULL DEFAULT 0,
      severity TEXT NOT NULL DEFAULT 'all',
      retailer_scope_json TEXT NOT NULL DEFAULT '[]',
      price_ceiling REAL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

  db.prepare(`
    INSERT OR IGNORE INTO retailers (name, base_url, adapter_key, enabled)
    VALUES
      ('Pokemon Center', 'https://www.pokemoncenter.com', 'pokemoncenter', 1),
      ('Best Buy', 'https://www.bestbuy.com', 'bestbuy', 1),
      ('Target', 'https://www.target.com', 'target', 1),
      ('Walmart', 'https://www.walmart.com', 'walmart', 1),
      ('GameStop', 'https://www.gamestop.com', 'gamestop', 1)
  `).run();

  return db;
}

module.exports = { createDb };
