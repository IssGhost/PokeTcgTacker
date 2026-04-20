const { tasks } = require('../app');

module.exports = {
  runPokemonCenterMonitorCycle: tasks.runPokemonCenterMonitorCycle,
  runMajorRetailMonitorCycle: tasks.runMajorRetailMonitorCycle,
  runAutomatedScan: tasks.runAutomatedScan,
  runPokemonCenterDiscovery: tasks.runPokemonCenterDiscovery
};
