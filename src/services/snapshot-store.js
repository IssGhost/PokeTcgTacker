function persistRawSnapshot(db, snapshot) {
  db.prepare(`
    INSERT INTO monitor_snapshots (retailer_key, product_offer_id, product_url, availability_state, confidence_score, raw_signal, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.retailer_key,
    snapshot.product_offer_id || null,
    snapshot.product_url,
    snapshot.availability_state,
    snapshot.confidence_score,
    snapshot.raw_signal,
    snapshot.detected_at || new Date().toISOString()
  );
}

module.exports = { persistRawSnapshot };
