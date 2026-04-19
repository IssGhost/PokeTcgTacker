const { sendEmailAlert, sendSmsAlert } = require('./multi-channel-notifier');

const RETRY_BACKOFF_MINUTES = [5, 15, 60, 180];

function computeNextAttempt(attemptsCount) {
  const idx = Math.max(0, Math.min(RETRY_BACKOFF_MINUTES.length - 1, attemptsCount));
  const mins = RETRY_BACKOFF_MINUTES[idx];
  return new Date(Date.now() + mins * 60 * 1000).toISOString();
}

function queueNotification(db, { userId, channel, message, status = 'queued' }) {
  return db.prepare(`
    INSERT INTO notification_logs (user_id, channel, message, status, attempts_count, next_attempt_at, last_error)
    VALUES (?, ?, ?, ?, 0, ?, NULL)
  `).run(
    userId,
    channel,
    message,
    status,
    status === 'queued' ? new Date().toISOString() : null
  );
}

function claimDueNotifications(db, limit = 50) {
  const rows = db.prepare(`
    SELECT nl.*, u.discord_webhook, u.email, u.email_address, u.phone_number
    FROM notification_logs nl
    JOIN users u ON u.id = nl.user_id
    WHERE nl.status = 'queued'
      AND (nl.next_attempt_at IS NULL OR nl.next_attempt_at <= ?)
    ORDER BY nl.created_at ASC
    LIMIT ?
  `).all(new Date().toISOString(), limit);

  return rows;
}

async function dispatchSingle(row) {
  if (row.channel === 'discord') {
    const webhook = String(row.discord_webhook || '').trim();
    if (!webhook) {
      return { ok: false, error: 'missing discord webhook' };
    }

    const parsed = new URL(webhook);
    const client = parsed.protocol === 'https:' ? require('https') : require('http');
    const body = JSON.stringify({ content: row.message });
    await new Promise((resolve, reject) => {
      const req = client.request(parsed, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
            return;
          }
          reject(new Error(`discord status ${res.statusCode}: ${data}`));
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    return { ok: true };
  }

  if (row.channel === 'email') {
    const to = String(row.email_address || row.email || '').trim();
    const result = await sendEmailAlert({
      to,
      subject: 'Pokemon Alerts Notification',
      message: row.message,
      userId: row.user_id
    });
    return result.status === 'sent' ? { ok: true } : { ok: false, error: result.reason || 'email skipped' };
  }

  if (row.channel === 'sms') {
    const result = await sendSmsAlert({
      to: String(row.phone_number || '').trim(),
      message: row.message,
      userId: row.user_id
    });
    return result.status === 'sent' ? { ok: true } : { ok: false, error: result.reason || 'sms skipped' };
  }

  return { ok: false, error: `unsupported channel ${row.channel}` };
}

async function processNotification(db, row) {
  const attempts = Number(row.attempts_count || 0);
  try {
    const result = await dispatchSingle(row);
    if (result.ok) {
      db.prepare(`
        UPDATE notification_logs
        SET status = 'sent', attempts_count = ?, last_error = NULL, next_attempt_at = NULL
        WHERE id = ?
      `).run(attempts + 1, row.id);
      return { id: row.id, status: 'sent' };
    }

    const nextAttempt = computeNextAttempt(attempts);
    db.prepare(`
      UPDATE notification_logs
      SET status = 'queued', attempts_count = ?, last_error = ?, next_attempt_at = ?
      WHERE id = ?
    `).run(attempts + 1, String(result.error || 'delivery failed').slice(0, 800), nextAttempt, row.id);
    return { id: row.id, status: 'queued', error: result.error };
  } catch (err) {
    const nextAttempt = computeNextAttempt(attempts);
    db.prepare(`
      UPDATE notification_logs
      SET status = 'queued', attempts_count = ?, last_error = ?, next_attempt_at = ?
      WHERE id = ?
    `).run(attempts + 1, String(err.message || err).slice(0, 800), nextAttempt, row.id);
    return { id: row.id, status: 'queued', error: err.message };
  }
}

async function processQueuedNotifications(db, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 200));
  const rows = claimDueNotifications(db, limit);
  const out = [];
  for (const row of rows) {
    out.push(await processNotification(db, row));
  }
  return {
    processed: out.length,
    sent: out.filter((r) => r.status === 'sent').length,
    queued: out.filter((r) => r.status === 'queued').length,
    items: out
  };
}

module.exports = {
  queueNotification,
  claimDueNotifications,
  processNotification,
  processQueuedNotifications
};
