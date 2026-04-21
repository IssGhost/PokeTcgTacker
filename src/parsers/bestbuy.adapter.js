const { STATES } = require('../../packages/core/state-engine');
const { normalizeSignal } = require('./normalized-signal');

function parseBestBuySignal({ apiProduct, html, productUrl, title, price, sku }) {
  const apiAvailability = apiProduct?.onlineAvailability;
  const text = String(html || '').toLowerCase();

  let availability = STATES.LISTED;
  let confidence = 0.55;
  if (apiAvailability === true) {
    availability = STATES.IN_STOCK;
    confidence = 0.95;
  } else if (apiAvailability === false) {
    availability = STATES.OUT_OF_STOCK;
    confidence = 0.95;
  } else if (text.includes('pre-order') || text.includes('preorder')) {
    availability = STATES.PREORDER_OPEN;
    confidence = 0.75;
  } else if (text.includes('sold out') || text.includes('out of stock')) {
    availability = STATES.OUT_OF_STOCK;
    confidence = 0.75;
  } else if (text.includes('add to cart') || text.includes('in stock')) {
    availability = STATES.IN_STOCK;
    confidence = 0.75;
  }

  return normalizeSignal({
    retailer: 'bestbuy',
    product_url: productUrl,
    external_id: sku || apiProduct?.sku || null,
    title: apiProduct?.name || title,
    variant: null,
    image_url: null,
    price: apiProduct?.salePrice ?? price,
    currency: 'USD',
    availability_state: availability,
    confidence_score: confidence,
    raw_signal: (apiProduct ? JSON.stringify(apiProduct) : text).slice(0, 4000)
  });
}

module.exports = { parseBestBuySignal };
