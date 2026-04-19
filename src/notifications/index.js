const { tasks } = require('../app');

module.exports = {
  sendPokemonCenterDigest: tasks.sendPokemonCenterDigest,
  sendTarget24hUpdate: tasks.sendTarget24hUpdate,
  sendAutomatedTargetUpdates: tasks.sendAutomatedTargetUpdates
};
