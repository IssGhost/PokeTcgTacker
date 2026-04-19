require('dotenv').config();

const { getEnv } = require('../config/env');
const { tasks } = require('../app');

getEnv();

async function runNotificationPass() {
  const mode = String(process.env.NOTIFICATION_WORKER_MODE || 'all').toLowerCase();
  if (mode === 'all' || mode === 'target') {
    await tasks.sendAutomatedTargetUpdates();
  }
  if (mode === 'all' || mode === 'pokemoncenter') {
    await tasks.sendPokemonCenterDigest();
  }
}

if (require.main === module) {
  runNotificationPass().catch((err) => {
    console.error('Notification worker failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { runNotificationPass };
