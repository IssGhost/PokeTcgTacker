function getEnabledSources(db) {
  return db.prepare(`
    SELECT source_key, source_type, display_name, enabled, polling_interval_ms, concurrency_limit,
           request_strategy, normalization_strategy, confidence_policy, suppression_policy,
           product_matcher, offer_ranking_rules, updated_at
    FROM source_registry
    WHERE enabled = 1
    ORDER BY source_type ASC, source_key ASC
  `).all();
}

function getAllSources(db) {
  return db.prepare(`
    SELECT source_key, source_type, display_name, enabled, polling_interval_ms, concurrency_limit,
           request_strategy, normalization_strategy, confidence_policy, suppression_policy,
           product_matcher, offer_ranking_rules, updated_at
    FROM source_registry
    ORDER BY source_type ASC, source_key ASC
  `).all();
}

function upsertSource(db, source) {
  db.prepare(`
    INSERT INTO source_registry (
      source_key, source_type, display_name, enabled, polling_interval_ms, concurrency_limit,
      request_strategy, normalization_strategy, confidence_policy, suppression_policy,
      product_matcher, offer_ranking_rules, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      source_type = excluded.source_type,
      display_name = excluded.display_name,
      enabled = excluded.enabled,
      polling_interval_ms = excluded.polling_interval_ms,
      concurrency_limit = excluded.concurrency_limit,
      request_strategy = excluded.request_strategy,
      normalization_strategy = excluded.normalization_strategy,
      confidence_policy = excluded.confidence_policy,
      suppression_policy = excluded.suppression_policy,
      product_matcher = excluded.product_matcher,
      offer_ranking_rules = excluded.offer_ranking_rules,
      updated_at = excluded.updated_at
  `).run(
    source.source_key,
    source.source_type,
    source.display_name,
    source.enabled ? 1 : 0,
    Number(source.polling_interval_ms || 120000),
    Number(source.concurrency_limit || 2),
    source.request_strategy || null,
    source.normalization_strategy || null,
    source.confidence_policy || null,
    source.suppression_policy || null,
    source.product_matcher || null,
    source.offer_ranking_rules || null,
    new Date().toISOString()
  );
}

module.exports = {
  getEnabledSources,
  getAllSources,
  upsertSource
};
