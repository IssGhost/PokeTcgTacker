const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { createDb } = require('../db');

test('createDb migrates legacy collection_cards schema missing set_name', () => {
  const tmpPath = path.join(os.tmpdir(), `poke-alerts-legacy-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  const legacy = new Database(tmpPath);
  legacy.exec(`
    CREATE TABLE collection_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_number TEXT,
      rarity TEXT,
      market_price REAL,
      average_cost REAL,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  legacy.close();

  const migrated = createDb(tmpPath);
  const cols = migrated.prepare('PRAGMA table_info(collection_cards)').all().map((row) => row.name);
  assert.ok(cols.includes('set_name'));
  assert.ok(cols.includes('card_name'));
  assert.ok(cols.includes('quantity'));
  migrated.close();
  fs.unlinkSync(tmpPath);
});
