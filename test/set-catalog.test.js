const test = require('node:test');
const assert = require('node:assert/strict');

const { LAST_10_RELEASED_SETS, PRODUCT_TYPE_TERMS, CURATED_RELEASE_MONITOR_PACK, CURATED_PRODUCT_TYPES, buildCuratedRetailMatrix, buildCatalogQueries } = require('../src/services/set-catalog');

test('set catalog includes 10 released sets', () => {
  assert.equal(LAST_10_RELEASED_SETS.length, 10);
  assert.ok(LAST_10_RELEASED_SETS.every((x) => x.name && x.release_date));
});

test('catalog query generator expands sets x product types', () => {
  const queries = buildCatalogQueries();
  assert.equal(queries.length, LAST_10_RELEASED_SETS.length * PRODUCT_TYPE_TERMS.length);
  assert.ok(queries.some((q) => q.query.includes('Elite Trainer Box')));
  assert.ok(queries.some((q) => q.query.includes('Booster Bundle')));
});

test('curated release monitor pack includes major retailers metadata', () => {
  assert.ok(CURATED_RELEASE_MONITOR_PACK.length >= 10);
  assert.ok(CURATED_RELEASE_MONITOR_PACK.some((x) => x.set_name === 'Chaos Rising'));
  assert.ok(CURATED_RELEASE_MONITOR_PACK.some((x) => x.bestbuy_sku));
  assert.ok(CURATED_RELEASE_MONITOR_PACK.every((x) => x.set_name && x.release_date && x.pokemoncenter_etb_url));
});

test('curated retail matrix expands release pack by product types', () => {
  const matrix = buildCuratedRetailMatrix();
  assert.equal(matrix.length, CURATED_RELEASE_MONITOR_PACK.length * CURATED_PRODUCT_TYPES.length);
  assert.ok(matrix.some((row) => row.product_type_key === 'blister'));
  assert.ok(matrix.some((row) => row.bestbuy_sku));
});
