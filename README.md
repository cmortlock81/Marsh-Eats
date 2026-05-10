# Marsh Eats

Production-shaped local MVP for Marsh Eats: a local-first UK food-ordering marketplace starting in Kent with an 8% restaurant commission and 1% of every paid order allocated to RNLI.

## Repository structure

```text
apps/customer-pwa          Mobile-first Next.js PWA for customers
apps/restaurant-dashboard  Next.js dashboard for restaurant teams
apps/admin-dashboard       Next.js dashboard for platform operations
services/api               Fastify TypeScript REST API, PostgreSQL schema, seed script
services/worker            Firebase notification worker
services/realtime          Reserved realtime package for scale-out fanout
packages/shared            Shared accounting and order-state rules
infrastructure/docker      Dockerfile and Docker Compose deployment foundation
docs                       Architecture documentation
```

## Local setup

1. Install Node.js 20.11+ and npm.
2. Copy environment defaults:

```bash
cp .env.example .env
```

3. Start local infrastructure:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
```

4. Install and build shared code:

```bash
npm install
npm run build --workspace @marsh-eats/shared
```

5. Seed local MVP data:

```bash
npm run seed
```

The seed is idempotent and safe to run repeatedly. It upserts users, restaurants, active menus, categories, and menu items by stable emails/slugs/names, and it adds local-development columns if an existing Docker volume was created before this MVP update.

## Test users

All seeded users use the same local password:

```text
MarshEats123!
```

| Role | Email | Purpose |
| --- | --- | --- |
| customer | customer@marsh-eats.test | Customer PWA ordering and Stripe test checkout |
| restaurant owner | owner.harbour@marsh-eats.test | Whitstable Harbour Kitchen queue |
| restaurant owner | owner.garden@marsh-eats.test | Canterbury Garden Curry queue |
| restaurant owner | owner.pier@marsh-eats.test | Margate Pier Pizza queue |
| admin | admin@marsh-eats.test | Admin onboarding and RNLI reporting |

## Run the apps locally

Run the API in one terminal:

```bash
npm run dev --workspace @marsh-eats/api
```

Run the customer PWA:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000 \
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_replace_me \
npm run dev --workspace @marsh-eats/customer-pwa -- --port 3001
```

Run the restaurant dashboard:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000 \
npm run dev --workspace @marsh-eats/restaurant-dashboard -- --port 3002
```

Run the admin dashboard:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000 \
npm run dev --workspace @marsh-eats/admin-dashboard -- --port 3003
```

The customer app includes a seeded customer login shortcut. The restaurant dashboard includes a seeded owner login shortcut, and the admin dashboard includes a seeded admin login shortcut.

## Stripe local testing

Set these in `.env` or your shell:

```text
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Useful Stripe test cards:

| Scenario | Card number | Notes |
| --- | --- | --- |
| Success | 4242 4242 4242 4242 | Any future expiry, any CVC |
| Decline | 4000 0000 0000 9995 | Shows failure state |
| 3DS/authentication | 4000 0025 0000 3155 | Exercises additional authentication |

Forward local webhooks with the Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/v1/stripe/webhook
```

Copy the printed `whsec_...` value to `STRIPE_WEBHOOK_SECRET`, restart the API, then complete a test payment from the customer PWA. The webhook transitions `payment_intent.succeeded` orders to `paid` and `payment_intent.payment_failed` orders to `failed` through the shared order-state validation.

## API highlights

- `GET /api/v1/restaurants` returns active seeded restaurants from PostgreSQL.
- `GET /api/v1/restaurants/:id/menu` returns active menu categories and items from PostgreSQL.
- `POST /api/v1/orders` requires auth, validates restaurant fulfilment/menu availability, and calculates totals server-side.
- `POST /api/v1/orders/:id/payment-intents` creates a Stripe PaymentIntent for the server-calculated order total.
- `GET /api/v1/restaurants/:id/orders` and `GET /restaurants/:restaurantId/orders/events` power the restaurant realtime queue.
- `PATCH /api/v1/orders/:id/status` enforces role checks and shared valid transitions.
- `GET /api/v1/admin/rnli-report` returns gross value, Marsh Eats commission, restaurant payable, and RNLI contribution by restaurant/date range, with `format=csv` support.

## Checks

```bash
npm test
npm run build
```

## Production notes and known limitations

- PostgreSQL remains the marketplace source of truth; WordPress/WooCommerce and Mortify integrations should sync through API boundaries rather than becoming the canonical marketplace database.
- Redis is included for caching, queues, locks, and rate limiting expansion.
- The MVP does not implement in-house delivery; restaurants handle delivery and/or collection.
- Customer, restaurant, and admin screens are production-shaped MVPs, but richer routing, account management, refund tooling, and restaurant menu editing ergonomics should be expanded before public launch.
- The local auth token is HMAC-signed and role-enforced server-side; production should move to hardened session rotation, secure cookies, MFA for admins, audit review, and managed secret storage.
- Server-Sent Events use PostgreSQL notifications for MVP fanout; production should move fanout/presence to Redis streams or a dedicated realtime service when scale requires it.
