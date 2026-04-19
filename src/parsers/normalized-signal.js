function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSignal(input) {
  return {
    retailer: String(input.retailer || '').toLowerCase(),
    product_url: String(input.product_url || '').trim(),
    external_id: input.external_id ? String(input.external_id) : null,
    title: String(input.title || '').trim(),
    variant: input.variant ? String(input.variant).trim() : null,
    image_url: input.image_url ? String(input.image_url).trim() : null,
    price: toNumberOrNull(input.price),
    currency: String(input.currency || 'USD').toUpperCase(),
    availability_state: String(input.availability_state || 'UNKNOWN').toUpperCase(),
    confidence_score: Math.max(0, Math.min(1, Number(input.confidence_score ?? 0.5))),
    raw_signal: String(input.raw_signal || '').slice(0, 12000),
    detected_at: input.detected_at || new Date().toISOString()
  };
}

module.exports = { normalizeSignal };
