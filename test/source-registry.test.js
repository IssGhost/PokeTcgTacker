const test = require('node:test');
const assert = require('node:assert/strict');

const { createDb } = require('../db');
const { getEnabledSources, upsertSource } = require('../src/services/source-registry');
const { recordRawSighting, upsertNormalizedOffer, recordSuppression, recordPipelineTrace } = require('../src/services/ingestion-visibility');

test('source registry returns seeded enabled sources and supports upsert', () => {
  const db = createDb(':memory:');
  const seeded = getEnabledSources(db);
  assert.ok(seeded.length >= 5);

  upsertSource(db, {
    source_key: 'custom_feed',
    source_type: 'feed',
    display_name: 'Custom Feed',
    enabled: true,
    polling_interval_ms: 45000,
    concurrency_limit: 1,
    request_strategy: 'json_fetch',
    normalization_strategy: 'custom.normalizer',
    confidence_policy: 'default',
    suppression_policy: 'default',
    product_matcher: 'slug_matcher',
    offer_ranking_rules: 'price_then_confidence'
  });

  const all = getEnabledSources(db);
  assert.ok(all.some((s) => s.source_key === 'custom_feed'));
});

test('ingestion visibility writes raw sightings, normalized offers, suppressions, and traces', () => {
  const db = createDb(':memory:');

  recordRawSighting(db, {
    source_key: 'target',
    source_type: 'official_retailer',
    product_url: 'https://example.com/p/1',
    title: 'Example ETB',
    price: 49.99,
    availability_state: 'IN_STOCK',
    confidence_score: 0.92,
    raw_signal: 'add to cart'
  });

  upsertNormalizedOffer(db, {
    source_key: 'target',
    source_type: 'official_retailer',
    product_url: 'https://example.com/p/1',
    seller_name: 'Target',
    seller_type: 'first_party',
    title: 'Example ETB',
    price: 49.99,
    total_price: 49.99,
    availability_state: 'IN_STOCK',
    confidence_score: 0.92
  });

  recordSuppression(db, {
    source_key: 'target',
    product_url: 'https://example.com/p/1',
    reason: 'suppressed_by_cooldown',
    details: { oldState: 'IN_STOCK', newState: 'IN_STOCK' }
  });

  recordPipelineTrace(db, {
    source_key: 'target',
    product_url: 'https://example.com/p/1',
    source_hit: { ok: true },
    parse_result: { availability_state: 'IN_STOCK' },
    normalization_result: { confidence_score: 0.92 },
    dedupe_result: { withinCooldown: true },
    state_result: { transitioned: false },
    alert_decision: { emitted: false },
    notification_result: { queued: false }
  });

  const rawCount = db.prepare('SELECT COUNT(*) AS c FROM raw_sightings').get().c;
  const normCount = db.prepare('SELECT COUNT(*) AS c FROM normalized_offers').get().c;
  const suppressionCount = db.prepare('SELECT COUNT(*) AS c FROM suppression_events').get().c;
  const traceCount = db.prepare('SELECT COUNT(*) AS c FROM pipeline_traces').get().c;

  assert.equal(rawCount, 1);
  assert.equal(normCount, 1);
  assert.equal(suppressionCount, 1);
  assert.equal(traceCount, 1);
});
