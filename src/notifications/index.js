const { tasks } = require('../app');
const { db } = require('../app');
const { processQueuedNotifications } = require('../services/notification-dispatcher');

module.exports = {
  sendPokemonCenterDigest: tasks.sendPokemonCenterDigest,
  sendTarget24hUpdate: tasks.sendTarget24hUpdate,
  sendAutomatedTargetUpdates: tasks.sendAutomatedTargetUpdates,
  processQueuedNotifications: (opts) => processQueuedNotifications(db, opts)
};
