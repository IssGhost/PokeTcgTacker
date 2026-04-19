require('dotenv').config();

const { getEnv } = require('../config/env');
const { tasks } = require('../app');

getEnv();

async function runNotificationPass() {
  await tasks.sendAutomatedTargetUpdates();
  await tasks.sendPokemonCenterDigest();
}

if (require.main === module) {
  runNotificationPass().catch((err) => {
    console.error('Notification worker failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { runNotificationPass };
