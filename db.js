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

    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      source_name TEXT NOT NULL,
      price REAL,
      url TEXT,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS monitor_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      retailer_key TEXT NOT NULL,
      product_offer_id INTEGER,
      product_url TEXT NOT NULL,
      availability_state TEXT NOT NULL,
      confidence_score REAL NOT NULL DEFAULT 0.5,
      raw_signal TEXT NOT NULL,
      detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_offer_id) REFERENCES product_offers(id)
    );

    CREATE TABLE IF NOT EXISTS source_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT UNIQUE NOT NULL,
      source_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      polling_interval_ms INTEGER NOT NULL DEFAULT 120000,
      concurrency_limit INTEGER NOT NULL DEFAULT 2,
      request_strategy TEXT,
      normalization_strategy TEXT,
      confidence_policy TEXT,
      suppression_policy TEXT,
      product_matcher TEXT,
      offer_ranking_rules TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS raw_sightings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      scrape_url TEXT,
      product_url TEXT,
      title TEXT,
      seller_name TEXT,
      seller_type TEXT,
      price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      availability_state TEXT NOT NULL DEFAULT 'UNKNOWN',
      confidence_score REAL NOT NULL DEFAULT 0.5,
      parser_version TEXT,
      raw_signal TEXT,
      raw_hash TEXT,
      suppression_reason TEXT,
      detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS normalized_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      source_type TEXT NOT NULL,
      product_offer_id INTEGER,
      product_id INTEGER,
      product_url TEXT,
      external_id TEXT,
      title TEXT,
      variant TEXT,
      image_url TEXT,
      seller_name TEXT,
      seller_type TEXT,
      price REAL,
      shipping_price REAL,
      total_price REAL,
      currency TEXT NOT NULL DEFAULT 'USD',
      availability_state TEXT NOT NULL DEFAULT 'UNKNOWN',
      confidence_score REAL NOT NULL DEFAULT 0.5,
      parser_version TEXT,
      normalized_hash TEXT,
      detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_key, product_url, seller_name)
    );

    CREATE TABLE IF NOT EXISTS suppression_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      product_offer_id INTEGER,
      product_url TEXT,
      reason TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pipeline_traces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_key TEXT NOT NULL,
      product_url TEXT,
      source_hit_json TEXT,
      parse_result_json TEXT,
      normalization_result_json TEXT,
      dedupe_result_json TEXT,
      state_result_json TEXT,
      alert_decision_json TEXT,
      notification_result_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (!hasColumn("users", "discord_webhook")) {
    db.exec("ALTER TABLE users ADD COLUMN discord_webhook TEXT");
  }
  if (!hasColumn("users", "email_address")) {
    db.exec("ALTER TABLE users ADD COLUMN email_address TEXT");
  }
  if (!hasColumn("users", "phone_number")) {
    db.exec("ALTER TABLE users ADD COLUMN phone_number TEXT");
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
  if (!hasColumn("notification_logs", "attempts_count")) {
    db.exec("ALTER TABLE notification_logs ADD COLUMN attempts_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn("notification_logs", "last_error")) {
    db.exec("ALTER TABLE notification_logs ADD COLUMN last_error TEXT");
  }
  if (!hasColumn("notification_logs", "next_attempt_at")) {
    db.exec("ALTER TABLE notification_logs ADD COLUMN next_attempt_at TEXT");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_monitor_snapshots_detected_at ON monitor_snapshots(detected_at);
    CREATE INDEX IF NOT EXISTS idx_raw_sightings_detected_at ON raw_sightings(detected_at);
    CREATE INDEX IF NOT EXISTS idx_raw_sightings_source_key ON raw_sightings(source_key);
    CREATE INDEX IF NOT EXISTS idx_normalized_offers_detected_at ON normalized_offers(detected_at);
    CREATE INDEX IF NOT EXISTS idx_normalized_offers_source_type ON normalized_offers(source_type);
    CREATE INDEX IF NOT EXISTS idx_suppression_events_created_at ON suppression_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_pipeline_traces_created_at ON pipeline_traces(created_at);
    CREATE INDEX IF NOT EXISTS idx_notification_logs_due ON notification_logs(status, next_attempt_at, created_at);
  `);

  db.prepare(`
    INSERT OR IGNORE INTO retailers (name, base_url, adapter_key, enabled)
    VALUES
      ('Pokemon Center', 'https://www.pokemoncenter.com', 'pokemoncenter', 1),
      ('Best Buy', 'https://www.bestbuy.com', 'bestbuy', 1),
      ('Target', 'https://www.target.com', 'target', 1),
      ('Walmart', 'https://www.walmart.com', 'walmart', 1),
      ('GameStop', 'https://www.gamestop.com', 'gamestop', 1)
  `).run();

  db.prepare(`
    INSERT OR IGNORE INTO source_registry
      (source_key, source_type, display_name, enabled, polling_interval_ms, concurrency_limit, request_strategy, normalization_strategy, confidence_policy, suppression_policy, product_matcher, offer_ranking_rules)
    VALUES
      ('pokemoncenter', 'official_retailer', 'Pokémon Center', 1, 60000, 2, 'html_fetch', 'pokemoncenter.adapter', 'default_high_confidence', 'default_suppression', 'slug_matcher', 'first_party_first'),
      ('target', 'official_retailer', 'Target', 1, 120000, 2, 'html_fetch', 'target.adapter', 'default_high_confidence', 'default_suppression', 'slug_matcher', 'first_party_first'),
      ('walmart', 'official_retailer', 'Walmart', 1, 120000, 2, 'html_fetch', 'walmart.adapter', 'default_medium_confidence', 'default_suppression', 'slug_matcher', 'first_party_first'),
      ('bestbuy', 'official_retailer', 'Best Buy', 1, 120000, 2, 'html_fetch', 'bestbuy.adapter', 'default_high_confidence', 'default_suppression', 'sku_matcher', 'first_party_first'),
      ('gamestop', 'official_retailer', 'GameStop', 1, 120000, 2, 'html_fetch', 'gamestop.adapter', 'default_medium_confidence', 'default_suppression', 'slug_matcher', 'first_party_first'),
      ('tcgplayer_market', 'secondary_market', 'TCGPlayer Market Lane', 1, 300000, 1, 'manual_snapshot', 'market.snapshot', 'market_informational', 'market_suppression', 'fuzzy_matcher', 'price_then_confidence'),
      ('ebay_market', 'secondary_market', 'eBay Market Lane', 1, 300000, 1, 'manual_snapshot', 'market.snapshot', 'market_informational', 'market_suppression', 'fuzzy_matcher', 'price_then_confidence')
  `).run();

  return db;
}

module.exports = { createDb };
