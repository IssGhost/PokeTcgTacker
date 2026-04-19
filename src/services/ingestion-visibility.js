const crypto = require('crypto');

function hashPayload(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex');
}

function recordRawSighting(db, payload) {
  return db.prepare(`
    INSERT INTO raw_sightings (
      source_key, source_type, scrape_url, product_url, title, seller_name, seller_type,
      price, currency, availability_state, confidence_score, parser_version, raw_signal,
      raw_hash, suppression_reason, detected_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.source_key,
    payload.source_type,
    payload.scrape_url || null,
    payload.product_url || null,
    payload.title || null,
    payload.seller_name || null,
    payload.seller_type || null,
    Number.isFinite(Number(payload.price)) ? Number(payload.price) : null,
    payload.currency || 'USD',
    payload.availability_state || 'UNKNOWN',
    Number(payload.confidence_score ?? 0.5),
    payload.parser_version || 'v1',
    String(payload.raw_signal || '').slice(0, 12000),
    payload.raw_hash || hashPayload(payload.raw_signal || payload.product_url || payload.title || ''),
    payload.suppression_reason || null,
    payload.detected_at || new Date().toISOString()
  );
}

function upsertNormalizedOffer(db, payload) {
  const normalizedHash = hashPayload(JSON.stringify({
    source_key: payload.source_key,
    product_url: payload.product_url,
    title: payload.title,
    seller_name: payload.seller_name,
    price: payload.price,
    availability_state: payload.availability_state
  }));

  db.prepare(`
    INSERT INTO normalized_offers (
      source_key, source_type, product_offer_id, product_id, product_url, external_id, title, variant,
      image_url, seller_name, seller_type, price, shipping_price, total_price, currency,
      availability_state, confidence_score, parser_version, normalized_hash, detected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key, product_url, seller_name) DO UPDATE SET
      product_offer_id = excluded.product_offer_id,
      product_id = excluded.product_id,
      external_id = excluded.external_id,
      title = excluded.title,
      variant = excluded.variant,
      image_url = excluded.image_url,
      seller_type = excluded.seller_type,
      price = excluded.price,
      shipping_price = excluded.shipping_price,
      total_price = excluded.total_price,
      currency = excluded.currency,
      availability_state = excluded.availability_state,
      confidence_score = excluded.confidence_score,
      parser_version = excluded.parser_version,
      normalized_hash = excluded.normalized_hash,
      detected_at = excluded.detected_at,
      updated_at = excluded.updated_at
  `).run(
    payload.source_key,
    payload.source_type,
    payload.product_offer_id || null,
    payload.product_id || null,
    payload.product_url || null,
    payload.external_id || null,
    payload.title || null,
    payload.variant || null,
    payload.image_url || null,
    payload.seller_name || 'first_party',
    payload.seller_type || 'first_party',
    Number.isFinite(Number(payload.price)) ? Number(payload.price) : null,
    Number.isFinite(Number(payload.shipping_price)) ? Number(payload.shipping_price) : null,
    Number.isFinite(Number(payload.total_price)) ? Number(payload.total_price) : null,
    payload.currency || 'USD',
    payload.availability_state || 'UNKNOWN',
    Number(payload.confidence_score ?? 0.5),
    payload.parser_version || 'v1',
    normalizedHash,
    payload.detected_at || new Date().toISOString(),
    new Date().toISOString()
  );
}

function recordSuppression(db, payload) {
  db.prepare(`
    INSERT INTO suppression_events (source_key, product_offer_id, product_url, reason, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    payload.source_key,
    payload.product_offer_id || null,
    payload.product_url || null,
    payload.reason,
    payload.details ? JSON.stringify(payload.details).slice(0, 4000) : null,
    payload.created_at || new Date().toISOString()
  );
}

function recordPipelineTrace(db, trace) {
  db.prepare(`
    INSERT INTO pipeline_traces (
      source_key, product_url, source_hit_json, parse_result_json, normalization_result_json,
      dedupe_result_json, state_result_json, alert_decision_json, notification_result_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trace.source_key,
    trace.product_url || null,
    JSON.stringify(trace.source_hit || {}).slice(0, 4000),
    JSON.stringify(trace.parse_result || {}).slice(0, 4000),
    JSON.stringify(trace.normalization_result || {}).slice(0, 4000),
    JSON.stringify(trace.dedupe_result || {}).slice(0, 4000),
    JSON.stringify(trace.state_result || {}).slice(0, 4000),
    JSON.stringify(trace.alert_decision || {}).slice(0, 4000),
    JSON.stringify(trace.notification_result || {}).slice(0, 4000),
    trace.created_at || new Date().toISOString()
  );
}

module.exports = {
  recordRawSighting,
  upsertNormalizedOffer,
  recordSuppression,
  recordPipelineTrace
};
