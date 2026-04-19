const test = require('node:test');
const assert = require('node:assert/strict');

const { LAST_10_RELEASED_SETS, PRODUCT_TYPE_TERMS, buildCatalogQueries } = require('../src/services/set-catalog');

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
