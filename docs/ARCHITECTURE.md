# Pokemon TCG Alerts Architecture (Scaffold)

## Product layers

1. **Layer 1 (Priority): Pokémon Center**
   - Discovery targets: TCG category, New Releases, Preorder, Back in Stock, sitemap/product feed.
   - Monitor product URLs + category pages.

2. **Layer 2: Major Retail**
   - Best Buy, Target, Walmart, GameStop (Amazon optional and only sold-by-Amazon if enabled).

3. **Layer 3 (Optional): Market View**
   - TCGPlayer/eBay/StockX-style pricing and community signals.
   - Must remain separate from retail in-stock signals.

## Services

- **Discovery Service**
- **Monitor Service**
- **Parser/Normalizer**
- **State Engine**
- **Alert Service**
- **Digest Service** (6-hour summary)
- **Admin/API**

## Normalized state machine

Defined in `packages/core/state-engine/index.js`:

- `UNKNOWN`
- `LISTED`
- `COMING_SOON`
- `PREORDER_OPEN`
- `IN_STOCK`
- `LOW_STOCK`
- `OUT_OF_STOCK`
- `REMOVED`
- `PRICE_CHANGED`

## Alert transitions

The state engine currently flags meaningful transitions for alerting:

- OUT_OF_STOCK -> IN_STOCK
- OUT_OF_STOCK -> PREORDER_OPEN
- COMING_SOON -> PREORDER_OPEN
- LISTED -> IN_STOCK

And price-drop events when threshold conditions are met.

## Repository scaffold

- `apps/web` — frontend shell
- `apps/api` — admin/API service
- `apps/worker` — discovery + monitor runtime
- `apps/discord-bot` — slash commands and outbound Discord delivery
- `packages/adapters/*` — retailer-specific integrations
- `packages/core/*` — shared models, parser contracts, state engine
- `infra/railway` — deployment notes

## Deployment direction

- Frontend: Vercel
- API + Worker: Railway/Fly/Render
- DB: Railway Postgres/Neon/Supabase
- Redis: Upstash/Railway Redis
- Digest: Railway Cron / scheduled workflow
