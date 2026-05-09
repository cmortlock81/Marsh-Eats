# Marsh Eats

Production-grade foundation for Marsh Eats: a local-first UK food-ordering marketplace starting in Kent with an 8% restaurant commission and 1% of every paid order allocated to RNLI.

## Implemented actions from the original brief

- Mobile-first customer PWA with Apple-style UI, bottom navigation, web manifest, and service-worker caching.
- Restaurant dashboard foundation for live operational order queues and availability status.
- Admin dashboard foundation for onboarding, commission, RNLI contribution reporting, order search, refund support, and audit-log review.
- REST API service for restaurant discovery, menu lookup, checkout order creation, Stripe PaymentIntent creation, Stripe webhook handling, and order status changes.
- PostgreSQL schema migration with UUID primary keys, enums, foreign keys, integer pence money columns, timestamptz columns, soft deletes where appropriate, order item snapshots, and reporting/discovery indexes.
- Shared order state machine that rejects invalid transitions with HTTP 409 semantics.
- Shared accounting logic for 8% commission, 1% RNLI allocation, and restaurant payable calculations in GBP pence.
- Stripe PaymentIntents with idempotency-key support, Connect-ready restaurant account storage, webhook signature verification, and storage of Stripe identifiers only.
- Firebase Cloud Messaging worker foundation for order accepted, ready, and completed notifications.
- Server-Sent Events realtime stream for restaurant dashboards, backed by PostgreSQL notifications for MVP fanout.
- Docker Compose for PostgreSQL 16, Redis 7, and the API service.
- GitHub Actions CI for install, build, tests, and type checks.

## Repository structure

```text
apps/customer-pwa          Mobile-first Next.js PWA for customers
apps/restaurant-dashboard  Next.js dashboard for restaurant teams
apps/admin-dashboard       Next.js dashboard for platform operations
services/api               Fastify TypeScript REST API and database migration
services/worker            Firebase notification worker
services/realtime          Reserved realtime package for scale-out fanout
packages/shared            Shared accounting and order-state rules
infrastructure/docker      Dockerfile and Docker Compose deployment foundation
infrastructure/github-actions  CI notes
docs                       Architecture documentation
```

## Quick start

```bash
npm install
npm run build --workspace @marsh-eats/shared
npm test
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

Copy `.env.example` and provide real Stripe and Firebase credentials before accepting real payments or sending production notifications.

## Payment accounting example

For `total_pence = 3200`:

- `commission_pence = round(3200 * 800 / 10000) = 256`
- `rnli_contribution_pence = round(3200 * 100 / 10000) = 32`
- `restaurant_payable_pence = 2912`

## Production notes

- PostgreSQL remains the marketplace source of truth; WordPress/WooCommerce and Mortify integrations should sync through API boundaries rather than becoming the canonical marketplace database.
- Redis is included in infrastructure for caching, queues, locks, and rate limiting expansion.
- The MVP does not implement in-house delivery; restaurants handle delivery and/or collection.
- Cloudflare DNS/CDN/WAF and Plesk/VPS deployment can terminate TLS in front of the Docker services.
