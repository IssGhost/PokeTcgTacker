const http = require('http');
const https = require('https');

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Invalid notification provider URL'));
      return;
    }

    const body = JSON.stringify(payload);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let response = '';
      res.on('data', (chunk) => {
        response += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: response });
          return;
        }
        reject(new Error(`Provider POST failed (${res.statusCode}): ${response}`));
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendEmailAlert({ to, subject, message, userId }) {
  const providerUrl = String(process.env.EMAIL_WEBHOOK_URL || '').trim();
  if (!providerUrl) {
    return { status: 'skipped', reason: 'EMAIL_WEBHOOK_URL not set' };
  }
  if (!to) {
    return { status: 'skipped', reason: 'missing recipient email' };
  }

  await postJson(providerUrl, {
    to,
    subject,
    text: message,
    user_id: userId || null
  });
  return { status: 'sent' };
}

async function sendSmsAlert({ to, message, userId }) {
  const providerUrl = String(process.env.SMS_WEBHOOK_URL || '').trim();
  if (!providerUrl) {
    return { status: 'skipped', reason: 'SMS_WEBHOOK_URL not set' };
  }
  if (!to) {
    return { status: 'skipped', reason: 'missing recipient phone' };
  }

  await postJson(providerUrl, {
    to,
    text: message,
    user_id: userId || null
  });
  return { status: 'sent' };
}

module.exports = {
  sendEmailAlert,
  sendSmsAlert
};
