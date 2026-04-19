const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyEventSeverity,
  shouldDeliverBySeverity,
  shouldDeliverByPriceCeiling
} = require('../src/services/alert-policy');

test('classifyEventSeverity marks in-stock as high', () => {
  const severity = classifyEventSeverity({ newState: 'IN_STOCK' });
  assert.equal(severity, 'high');
});

test('classifyEventSeverity marks modest price drop as medium', () => {
  const severity = classifyEventSeverity({ oldPrice: 100, newPrice: 95, oldState: 'LISTED', newState: 'LISTED' });
  assert.equal(severity, 'medium');
});

test('shouldDeliverBySeverity honors medium threshold', () => {
  assert.equal(shouldDeliverBySeverity('medium', 'low'), false);
  assert.equal(shouldDeliverBySeverity('medium', 'high'), true);
});

test('shouldDeliverByPriceCeiling blocks over-ceiling prices', () => {
  assert.equal(shouldDeliverByPriceCeiling(50, 60), false);
  assert.equal(shouldDeliverByPriceCeiling(50, 40), true);
});
