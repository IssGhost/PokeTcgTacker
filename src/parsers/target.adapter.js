const { STATES } = require('../../packages/core/state-engine');
const { normalizeSignal } = require('./normalized-signal');

function parseTargetSignal({ html, productUrl, title, price }) {
  const text = String(html || '').toLowerCase();
  const statusMatches = [...String(html || '').matchAll(/"availability_status"\s*:\s*"([A-Z_]+)"/g)];
  const statuses = statusMatches.map((m) => m[1]);

  let availability = STATES.LISTED;
  let confidence = 0.5;
  if (statuses.includes('IN_STOCK') || text.includes('add to cart')) {
    availability = STATES.IN_STOCK;
    confidence = statuses.includes('IN_STOCK') ? 0.92 : 0.78;
  } else if (statuses.includes('PRE_ORDER') || text.includes('preorder')) {
    availability = STATES.PREORDER_OPEN;
    confidence = statuses.includes('PRE_ORDER') ? 0.9 : 0.76;
  } else if (statuses.includes('OUT_OF_STOCK') || text.includes('out of stock') || text.includes('sold out')) {
    availability = STATES.OUT_OF_STOCK;
    confidence = statuses.includes('OUT_OF_STOCK') ? 0.9 : 0.76;
  }

  return normalizeSignal({
    retailer: 'target',
    product_url: productUrl,
    external_id: null,
    title,
    variant: null,
    image_url: null,
    price,
    currency: 'USD',
    availability_state: availability,
    confidence_score: confidence,
    raw_signal: text.slice(0, 4000)
  });
}

module.exports = { parseTargetSignal };
