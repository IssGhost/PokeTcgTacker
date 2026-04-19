function classifyEventSeverity(event) {
  const newState = String(event.newState || '').toUpperCase();
  const oldState = String(event.oldState || '').toUpperCase();
  const oldPrice = Number(event.oldPrice);
  const newPrice = Number(event.newPrice);

  if (newState === 'IN_STOCK' || newState === 'PREORDER_OPEN') return 'high';
  if (newState === 'LOW_STOCK') return 'high';

  if (Number.isFinite(oldPrice) && Number.isFinite(newPrice) && newPrice < oldPrice) {
    const dropPct = ((oldPrice - newPrice) / oldPrice) * 100;
    if (dropPct >= 10) return 'high';
    return 'medium';
  }

  if (oldState !== newState) return 'medium';
  return 'low';
}

function shouldDeliverBySeverity(preferenceSeverity, eventSeverity) {
  const pref = String(preferenceSeverity || 'all').toLowerCase();
  const sev = String(eventSeverity || 'low').toLowerCase();

  if (pref === 'all') return true;
  if (pref === 'high') return sev === 'high';
  if (pref === 'medium') return sev === 'high' || sev === 'medium';
  return true;
}

function shouldDeliverByPriceCeiling(priceCeiling, newPrice) {
  const ceiling = Number(priceCeiling);
  const price = Number(newPrice);
  if (!Number.isFinite(ceiling)) return true;
  if (!Number.isFinite(price)) return true;
  return price <= ceiling;
}

module.exports = {
  classifyEventSeverity,
  shouldDeliverBySeverity,
  shouldDeliverByPriceCeiling
};
