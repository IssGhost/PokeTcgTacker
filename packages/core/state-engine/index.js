const STATES = Object.freeze({
  UNKNOWN: "UNKNOWN",
  LISTED: "LISTED",
  COMING_SOON: "COMING_SOON",
  PREORDER_OPEN: "PREORDER_OPEN",
  IN_STOCK: "IN_STOCK",
  LOW_STOCK: "LOW_STOCK",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  REMOVED: "REMOVED",
  PRICE_CHANGED: "PRICE_CHANGED"
});

const ALERT_TRANSITIONS = new Set([
  `${STATES.OUT_OF_STOCK}->${STATES.IN_STOCK}`,
  `${STATES.OUT_OF_STOCK}->${STATES.PREORDER_OPEN}`,
  `${STATES.COMING_SOON}->${STATES.PREORDER_OPEN}`,
  `${STATES.LISTED}->${STATES.IN_STOCK}`
]);

function transitionKey(fromState, toState) {
  return `${fromState || STATES.UNKNOWN}->${toState || STATES.UNKNOWN}`;
}

function shouldAlertTransition(fromState, toState) {
  return ALERT_TRANSITIONS.has(transitionKey(fromState, toState));
}

function shouldAlertPriceDrop(oldPrice, newPrice, thresholdPercent = 10) {
  if (typeof oldPrice !== "number" || typeof newPrice !== "number") return false;
  if (oldPrice <= 0 || newPrice >= oldPrice) return false;
  const dropPercent = ((oldPrice - newPrice) / oldPrice) * 100;
  return dropPercent >= thresholdPercent;
}

module.exports = {
  STATES,
  ALERT_TRANSITIONS,
  transitionKey,
  shouldAlertTransition,
  shouldAlertPriceDrop
};
