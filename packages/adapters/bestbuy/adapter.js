function normalizeBestBuyProduct(apiProduct) {
  return {
    retailerKey: "bestbuy",
    sku: apiProduct?.sku || null,
    title: apiProduct?.name || "",
    url: apiProduct?.url || "",
    price: apiProduct?.salePrice ?? null,
    currency: "USD"
  };
}

module.exports = {
  normalizeBestBuyProduct
};
