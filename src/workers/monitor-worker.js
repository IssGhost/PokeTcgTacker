require('dotenv').config();

const { getEnv } = require('../config/env');
const { tasks } = require('../app');

getEnv();

async function runMonitorPass() {
  const mode = String(process.env.MONITOR_WORKER_MODE || 'all').toLowerCase();

  if (mode === 'all' || mode === 'pokemoncenter') {
    await tasks.runPokemonCenterMonitorCycle();
  }
  if (mode === 'all' || mode === 'major-retail') {
    await tasks.runMajorRetailMonitorCycle();
  }
  if (mode === 'all' || mode === 'target-scan') {
    await tasks.runAutomatedScan(null, { targetOnly: true });
  }
  if (mode === 'all' || mode === 'source-registry') {
    await tasks.runSourceRegistryCycle();
  }
}

if (require.main === module) {
  runMonitorPass().catch((err) => {
    console.error('Monitor worker failed:', err);
    process.exitCode = 1;
  });
}

module.exports = { runMonitorPass };
