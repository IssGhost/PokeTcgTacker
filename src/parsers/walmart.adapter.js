const { STATES } = require('../../packages/core/state-engine');
const { normalizeSignal } = require('./normalized-signal');

function parseWalmartSignal({ html, productUrl, title, price }) {
  const text = String(html || '').toLowerCase();
  let availability = STATES.LISTED;
  let confidence = 0.55;
  if (text.includes('add to cart') || text.includes('in stock')) {
    availability = STATES.IN_STOCK;
    confidence = 0.78;
  } else if (text.includes('preorder') || text.includes('pre-order')) {
    availability = STATES.PREORDER_OPEN;
    confidence = 0.74;
  } else if (text.includes('out of stock') || text.includes('sold out') || text.includes('currently unavailable')) {
    availability = STATES.OUT_OF_STOCK;
    confidence = 0.78;
  }

  return normalizeSignal({
    retailer: 'walmart',
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

module.exports = { parseWalmartSignal };
