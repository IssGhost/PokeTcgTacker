# Pokemon TCG Alerts SaaS Starter

This is a starter app that turns a product-alert project into a basic subscription product:

- Email/password registration and login
- Automatic owner/admin account seeding for you
- Free, Basic, and Pro plan logic
- Stripe Checkout subscription flow
- Stripe webhook handler to activate/cancel subscriptions
- Simple dashboard for customer alert targets

## What this is
A monetization/auth layer for your alert service.

## What this is not
This does **not** auto-buy products, bypass anti-bot protections, or check out on retailer sites. It is a subscription wrapper around alert delivery and configuration.

## Stack
- Node.js
- Express
- better-sqlite3
- Stripe
- JWT cookie auth

## 1) Install

```bash
npm install
```

## 2) Create your environment file

Copy `.env.example` to `.env` and fill in:

- `APP_URL`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASIC_MONTHLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `OWNER_EMAIL`
- `OWNER_PASSWORD`

## 3) Start locally

```bash
npm start
```

Open:
`http://localhost:3000`

On first boot, the owner account is created automatically from `OWNER_EMAIL` and `OWNER_PASSWORD`.

## 4) Create Stripe products and prices

In Stripe, create:
- Product: Pokemon Alerts Basic
- Recurring monthly price → copy the `price_...` ID into `STRIPE_PRICE_BASIC_MONTHLY`
- Product: Pokemon Alerts Pro
- Recurring monthly price → copy the `price_...` ID into `STRIPE_PRICE_PRO_MONTHLY`

Stripe's subscription + Checkout docs describe this flow and recommend granting access only after verifying subscription activity, typically with webhook events. citeturn416653search0turn416653search1turn416653search10

## 5) Run the Stripe webhook locally

Using Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/stripe/webhook
```

Copy the webhook signing secret it gives you and place it in:
`STRIPE_WEBHOOK_SECRET`

Stripe recommends verifying webhook signatures on incoming events. citeturn416653search1turn416653search4

## 6) Key routes

- `/register`
- `/login`
- `/dashboard`
- `/pricing`
- `POST /create-checkout-session`
- `POST /stripe/webhook`

## 7) How to make this power the real tracker

Right now customers save alert targets into the `alert_targets` table.

To connect this to the tracker:
1. Update your tracker to load active rows from `alert_targets`
2. Send alerts to each row's saved channel
3. Only process users with:
   - owner role, or
   - active subscription status, or
   - free plan limits

## 8) Deploy on Railway

1. Push this folder to GitHub
2. Create a new Railway project from the repo
3. Add all env vars in the Railway Variables tab
4. Deploy the service
5. Set your Stripe webhook endpoint to:
   `https://YOUR-APP.up.railway.app/stripe/webhook`

Railway lets you define service variables in the Variables tab and deploy Node/Express services from GitHub. citeturn416653search2turn416653search5turn416653search8

## Notes

- Owner users are always forced to active pro access in the app.
- Regular users start on the free plan.
- You should swap SQLite for Postgres before serious production growth.
- Cookies are set with `secure: false` in this starter; change to `true` behind HTTPS in production.
