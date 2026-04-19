const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../db');
const {
  queueNotification,
  claimDueNotifications,
  processQueuedNotifications
} = require('../src/services/notification-dispatcher');

test('queueNotification inserts queued row and claimDueNotifications returns it', () => {
  const db = createDb(':memory:');
  const userInsert = db.prepare(`
    INSERT INTO users (email, password_hash)
    VALUES (?, ?)
  `).run('test@example.com', 'hash');

  queueNotification(db, {
    userId: userInsert.lastInsertRowid,
    channel: 'email',
    message: 'hello world',
    status: 'queued'
  });

  const due = claimDueNotifications(db, 10);
  assert.equal(due.length, 1);
  assert.equal(due[0].channel, 'email');
  assert.equal(due[0].status, 'queued');
});

test('processQueuedNotifications keeps unsendable notifications queued with attempts incremented', async () => {
  const db = createDb(':memory:');
  const userInsert = db.prepare(`
    INSERT INTO users (email, password_hash)
    VALUES (?, ?)
  `).run('noprovider@example.com', 'hash');

  queueNotification(db, {
    userId: userInsert.lastInsertRowid,
    channel: 'email',
    message: 'queue me',
    status: 'queued'
  });

  const result = await processQueuedNotifications(db, { limit: 5 });
  assert.equal(result.processed, 1);

  const row = db.prepare('SELECT * FROM notification_logs LIMIT 1').get();
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts_count, 1);
  assert.ok(row.next_attempt_at);
});
