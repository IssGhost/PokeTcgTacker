# Pokémon Center Adapter (Scaffold)

## Discovery sources

- sitemap.xml (and product sitemap when available)
- Trading Card Game category
- New Releases
- Preorder
- Back in Stock

## Monitoring inputs

- known product URLs
- category/listing pages for newly surfaced products

## Parser signals

- title
- SKU (if present)
- URL
- image
- price text
- button state (`Sold Out`, `Add to Cart`, `Preorder: Add to Cart/Basket`)
- quantity limit text
- release date text

## Notes

This adapter should avoid disallowed robots endpoints and only use permitted public pages.
