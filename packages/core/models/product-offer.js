/**
 * Normalized offer shape used by adapters and state engine.
 *
 * @typedef {Object} ProductOffer
 * @property {string} retailerKey
 * @property {string} productId
 * @property {string} title
 * @property {string} url
 * @property {string | null} sku
 * @property {number | null} price
 * @property {string | null} currency
 * @property {string} state - one of STATES from core/state-engine
 * @property {number} confidence - 0..1 parser confidence
 * @property {string | null} releaseDateText
 * @property {string | null} quantityLimitText
 */

module.exports = {};
