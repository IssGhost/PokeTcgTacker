function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function twoPassConfirm({ initialSignal, fetchSignalAgain, confirmStates = new Set(['IN_STOCK', 'PREORDER_OPEN']), delayMs = 1500 }) {
  if (!confirmStates.has(initialSignal.availability_state)) {
    return { confirmed: true, secondSignal: initialSignal, retracted: false };
  }

  await sleep(delayMs);
  const secondSignal = await fetchSignalAgain();
  const confirmed = secondSignal.availability_state === initialSignal.availability_state;

  return {
    confirmed,
    secondSignal,
    retracted: !confirmed
  };
}

function shouldEmitByConfidence(signal, threshold = 0.7) {
  return Number(signal.confidence_score || 0) >= threshold;
}

function isWithinCooldown({ db, offerId, newState, cooldownMs = 600000 }) {
  const row = db.prepare(`
    SELECT created_at, new_state
    FROM events
    WHERE product_offer_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(offerId);

  if (!row || row.new_state !== newState) return false;
  const age = Date.now() - new Date(row.created_at).getTime();
  return age >= 0 && age < cooldownMs;
}

module.exports = {
  twoPassConfirm,
  shouldEmitByConfidence,
  isWithinCooldown
};
