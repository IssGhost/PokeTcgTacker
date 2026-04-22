const { STATES } = require("../../core/state-engine");

function normalizePokemonCenterSnapshot(snapshot) {
  return {
    retailerKey: "pokemoncenter",
    productId: snapshot.productId || snapshot.url,
    title: snapshot.title || "",
    url: snapshot.url || "",
    sku: snapshot.sku || null,
    price: snapshot.price ?? null,
    currency: snapshot.currency || "USD",
    state: snapshot.state || STATES.UNKNOWN,
    confidence: typeof snapshot.confidence === "number" ? snapshot.confidence : 0.5,
    releaseDateText: snapshot.releaseDateText || null,
    quantityLimitText: snapshot.quantityLimitText || null
  };
}

module.exports = {
  normalizePokemonCenterSnapshot
};
