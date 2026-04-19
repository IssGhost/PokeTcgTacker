require('dotenv').config();

const { getEnv } = require('../config/env');
const { tasks } = require('../app');

getEnv();

async function runMonitorPass() {
  await tasks.runPokemonCenterMonitorCycle();
  await tasks.runMajorRetailMonitorCycle();
  await tasks.runAutomatedScan(null, { targetOnly: true });
}

if (require.main === module) {
  runMonitorPass().catch((err) => {
    console.error('Monitor worker failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { runMonitorPass };
