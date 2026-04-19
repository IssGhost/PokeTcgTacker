const { STATES } = require('../../packages/core/state-engine');
const { normalizeSignal } = require('./normalized-signal');

function parsePokemonCenterSignal({ html, productUrl, title, price, imageUrl, sku }) {
  const text = String(html || '').toLowerCase();
  let availability = STATES.LISTED;
  let confidence = 0.55;

  if (text.includes('preorder: add to cart') || text.includes('preorder: add to basket')) {
    availability = STATES.PREORDER_OPEN;
    confidence = 0.9;
  } else if (text.includes('add to cart') || text.includes('add to basket')) {
    availability = STATES.IN_STOCK;
    confidence = 0.85;
  } else if (text.includes('sold out') || text.includes('out of stock') || text.includes('currently unavailable')) {
    availability = STATES.OUT_OF_STOCK;
    confidence = 0.85;
  } else if (text.includes('coming soon')) {
    availability = STATES.COMING_SOON;
    confidence = 0.75;
  }

  return normalizeSignal({
    retailer: 'pokemoncenter',
    product_url: productUrl,
    external_id: sku || null,
    title,
    variant: null,
    image_url: imageUrl || null,
    price,
    currency: 'USD',
    availability_state: availability,
    confidence_score: confidence,
    raw_signal: text.slice(0, 4000)
  });
}

module.exports = { parsePokemonCenterSignal };
