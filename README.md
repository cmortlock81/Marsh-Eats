You are a senior full-stack software architect and production engineer.

Build a production-grade, scalable food-ordering platform called Marsh Eats.

This is not a prototype. Design and implement the foundation for real users, real payments, restaurants, orders, dashboards, and regional UK scale.

Business context:
Marsh Eats competes with Just Eat, Uber Eats, and Deliveroo.

Core differentiation:
- 8% restaurant commission
- 1% of every paid order allocated to RNLI
- Local-first marketplace starting in Kent, UK

Key business constraint:
- No in-house delivery initially
- Restaurants handle delivery and/or collection

Primary goal:
Create a contractor-ready production codebase and infrastructure foundation for the Marsh Eats MVP.

Architecture constraints:
- Customer frontend must be a mobile-first PWA with app-like UX
- Clean Apple-style UI
- Bottom navigation
- Basic offline support through service worker caching
- Must integrate cleanly with WordPress/WooCommerce and Mortify
- Backend must expose REST APIs
- PostgreSQL is the marketplace source of truth
- Redis is used for caching, queues, locks, and rate limiting
- Stripe is used for UK-compliant payments
- Firebase Cloud Messaging is used for order notifications
- Docker-based deployment targeting Linux VPS/Plesk with Cloudflare DNS/CDN/WAF
- GitHub Actions CI/CD preferred

Do not create vague pseudo-code.
Do not create placeholder-only architecture.
Do not rely on WordPress postmeta as the marketplace source of truth.
Do not store card details.
Do not skip payment idempotency, RBAC, validation, audit logging, or order-state enforcement.

Recommended repository structure:

/apps/customer-pwa
/apps/restaurant-dashboard
/apps/admin-dashboard
/services/api
/services/worker
/services/realtime
/packages/shared
/infrastructure/docker
/infrastructure/github-actions
/docs

Preferred stack:
- Frontend: Next.js + React + TypeScript
- API: NestJS + TypeScript, or Laravel if the repository is PHP-first
- Database: PostgreSQL 16+
- Cache/queue: Redis 7+
- Payments: Stripe Payment Intents, with Connect-ready design
- Notifications: Firebase Cloud Messaging
- Containers: Docker Compose
- CI/CD: GitHub Actions
- CDN/WAF: Cloudflare

If choosing between NestJS and Laravel, prefer NestJS unless existing project files indicate a PHP/Laravel architecture.

Implement the following core domains:

1. Customer
- Registration/login/logout
- Browse restaurants
- View restaurant menus
- Add items to basket
- One basket per restaurant
- Checkout
- Order history
- Order detail
- RNLI contribution display per order, e.g. “£0.32 from this order supports RNLI”

2. Restaurant
- Restaurant dashboard
- Menu management
- Order management
- Status updates:
  - accepted
  - preparing
  - ready
  - completed
- Availability toggle
- Restaurant staff role checks

3. Admin
- Platform dashboard
- Restaurant onboarding tools
- Commission tracking
- RNLI contribution tracking
- Order search
- Refund support
- Audit log

4. Payments
- Stripe PaymentIntent creation
- Stripe webhook handling
- Webhook signature verification
- Idempotent payment processing
- Card payments
- Apple Pay / Google Pay compatibility through Stripe Payment Element or Express Checkout
- Store Stripe identifiers only
- Never store raw card data

Payment split/accounting logic:
- 8% platform commission
- 1% RNLI allocation
- Restaurant payable = total - commission - RNLI allocation
- RNLI allocation is tracked internally in MVP, not necessarily auto-transferred
- Store all money as integer pence
- Currency: GBP

Example:
For total_pence = 3200:
- commission_pence = round(3200 * 800 / 10000) = 256
- rnli_contribution_pence = round(3200 * 100 / 10000) = 32
- restaurant_payable_pence = 2912

5. Order state machine

Allowed order statuses:
- pending_payment
- paid
- sent_to_restaurant
- accepted
- preparing
- ready
- completed
- cancelled
- refunded
- failed

Allowed transitions:
- pending_payment -> paid, actor: Stripe webhook
- pending_payment -> failed, actor: Stripe webhook/API timeout
- paid -> sent_to_restaurant, actor: worker
- sent_to_restaurant -> accepted, actor: restaurant
- accepted -> preparing, actor: restaurant
- preparing -> ready, actor: restaurant
- ready -> completed, actor: restaurant/admin
- paid/sent_to_restaurant/accepted -> cancelled, actor: admin/restaurant policy
- paid/completed/cancelled -> refunded, actor: admin via Stripe

Reject invalid transitions with HTTP 409 Conflict.
Record every status transition in order_status_events.

6. Notifications
Use Firebase Cloud Messaging for:
- order accepted
- order ready
- order completed

Store FCM notification tokens per user.
Use a worker to send notifications after order status changes.
Notification payload must include orderId, status, and URL.

7. Realtime restaurant dashboard
Implement either:
- Server-Sent Events for MVP, preferred for simplicity
or
- WebSocket gateway

Restaurant dashboards must receive new paid orders and status changes in near real time.
Use Redis Pub/Sub or Redis Streams for event fanout.

8. PostgreSQL schema

Create migrations for the following tables and supporting enums/indexes:

Enums:
- user_role:
  - customer
  - restaurant_owner
  - restaurant_staff
  - admin
  - support
- restaurant_status:
  - draft
  - pending_review
  - active
  - suspended
  - closed
- fulfilment_type:
  - delivery
  - collection
- order_status:
  - pending_payment
  - paid
  - sent_to_restaurant
  - accepted
  - preparing
  - ready
  - completed
  - cancelled
  - refunded
  - failed
- payment_status:
  - requires_payment_method
  - requires_confirmation
  - processing
  - succeeded
  - failed
  - cancelled
  - refunded
  - partially_refunded

Tables:
- users
- user_addresses
- restaurants
- restaurant_opening_hours
- menus
- menu_categories
- menu_items
- orders
- order_items
- payments
- rnli_contributions
- order_status_events
- notification_tokens
- audit_log
- idempotency_keys
- regions

DDL requirements:
- Use UUID primary keys
- Use timestamptz
- Use integer pence for money
- Add indexes for restaurant discovery, order lookup, restaurant active order queues, RNLI reporting, and customer order history
- Add foreign keys
- Use soft delete where appropriate
- Snapshot item names, prices, allergens, and modifiers into order_items
- Use JSONB only for bounded metadata/snapshots, not primary relational data

Required API endpoints:

Auth:
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- POST /api/v1/auth/refresh
- GET /api/v1/auth/me
- POST /api/v1/auth/password-reset/request
- POST /api/v1/auth/password-reset/confirm

Restaurants:
- GET /api/v1/restaurants
- GET /api/v1/restaurants/{slug}
- GET /api/v1/restaurants/{id}/menus
- GET /api/v1/restaurants/{id}/availability

Basket:
- POST /api/v1/baskets
- GET /api/v1/baskets/current
- POST /api/v1/baskets/current/items
- PATCH /api/v1/baskets/current/items/{itemId}
- DELETE /api/v1/baskets/current/items/{itemId}

Orders:
- POST /api/v1/orders/checkout
- GET /api/v1/orders
- GET /api/v1/orders/{id}
- GET /api/v1/orders/{id}/events
- POST /api/v1/orders/{id}/cancel

Restaurant admin:
- GET /api/v1/restaurant-admin/restaurants/{id}/orders
- PATCH /api/v1/restaurant-admin/orders/{id}/status
- PATCH /api/v1/restaurant-admin/restaurants/{id}/availability
- POST /api/v1/restaurant-admin/restaurants/{id}/menus
- POST /api/v1/restaurant-admin/menu-categories
- POST /api/v1/restaurant-admin/menu-items
- PATCH /api/v1/restaurant-admin/menu-items/{id}
- DELETE /api/v1/restaurant-admin/menu-items/{id}

Payments:
- POST /api/v1/payments/stripe/webhook
- GET /api/v1/payments/{orderId}
- POST /api/v1/admin/payments/{paymentId}/refund
- POST /api/v1/admin/restaurants/{id}/stripe/onboarding-link

Admin:
- GET /api/v1/admin/dashboard
- GET /api/v1/admin/restaurants
- POST /api/v1/admin/restaurants
- PATCH /api/v1/admin/restaurants/{id}
- GET /api/v1/admin/orders
- GET /api/v1/admin/commissions
- GET /api/v1/admin/rnli-contributions
- GET /api/v1/admin/audit-log

Security requirements:
- HTTPS-only production config
- HTTP-only Secure SameSite cookies if cookie auth is used
- Refresh-token rotation if JWT auth is used
- CSRF protection for cookie-authenticated mutations
- RBAC on every protected endpoint
- Restaurant ownership checks on restaurant-admin routes
- Input validation using DTO/schema validation
- Parameterized SQL or ORM query builder only
- Rate limiting by IP, user, and route
- Audit log admin and restaurant mutations
- Verify Stripe webhook signatures
- Idempotency keys on checkout and payment mutations
- Do not expose WooCommerce API keys to browser
- Use secrets from environment variables only
- Add security headers
- Protect against XSS, CSRF, SQL injection, SSRF, and brute-force login

Rate limits:
- Login: 5/min/IP
- Password reset: 3/hour/email
- Restaurant search: 120/min/IP
- Checkout: 10/min/user
- Admin mutations: 60/min/admin

Caching:
Use Redis keys similar to:
- restaurant:list:{postcode}:{filters}
- restaurant:{id}:profile
- restaurant:{id}:menu:active
- order:{id}:status
- rate_limit:{ip}:{endpoint}
- idempotency:{key}

Cache TTLs:
- Restaurant listing: 60 seconds
- Restaurant profile: 5 minutes
- Active menu: 2 minutes
- Order status: 15 seconds
- Admin reports: 5 minutes

Invalidate:
- menu update -> restaurant menu cache
- availability toggle -> restaurant list cache for region
- order status change -> order status cache

Frontend requirements:

Customer PWA:
- Mobile-first responsive layout
- Bottom navigation: Home, Search, Orders, Account
- Restaurant list
- Restaurant page
- Menu page
- Basket page
- Checkout page
- Order tracking page
- Order history page
- Account page
- Service worker cache for shell and last viewed menus/restaurants
- Offline banner
- Disable checkout while offline
- Show RNLI contribution clearly at checkout and order detail

Restaurant dashboard:
- Login-protected
- Active orders list
- New order alert
- Order detail panel
- Status update buttons
- Availability toggle
- Menu CRUD
- Simple kitchen-friendly layout

Admin dashboard:
- Login-protected
- KPI cards:
  - gross order value
  - completed orders
  - cancelled orders
  - failed payments
  - commission accrued
  - RNLI contribution accrued
  - restaurant payable total
- Restaurant onboarding
- Order search
- RNLI monthly report
- Commission report
- Audit log

WordPress/WooCommerce integration:
- Keep WordPress for CMS, SEO, landing pages, and admin convenience
- Keep WooCommerce compatibility where useful
- Do not make WooCommerce postmeta the marketplace source of truth
- Use API integration between WordPress and Marsh Eats API
- Recommended routing:
  - / -> WordPress marketing site
  - /eat -> Customer PWA
  - /restaurant -> Restaurant dashboard
  - /admin -> Admin/WordPress/custom admin
  - api.marsheats.co.uk -> API

Docker deployment:
Create Docker Compose configuration for:
- nginx reverse proxy
- wordpress
- wordpress-db
- customer-pwa
- restaurant-dashboard
- admin-dashboard
- api
- realtime
- worker
- postgres
- redis

Environment variables:
- APP_ENV
- APP_URL
- API_URL
- DATABASE_URL
- REDIS_URL
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_CONNECT_CLIENT_ID
- FCM_PROJECT_ID
- FCM_CLIENT_EMAIL
- FCM_PRIVATE_KEY
- JWT_SIGNING_KEY
- COOKIE_SECRET
- POSTMARK_API_KEY or equivalent email provider
- S3_ENDPOINT
- S3_ACCESS_KEY
- S3_SECRET_KEY

CI/CD:
Create GitHub Actions workflows for:
- install dependencies
- lint
- typecheck
- unit tests
- integration tests
- build Docker images
- vulnerability scan
- push image to GHCR
- deploy to VPS over SSH
- run database migrations
- docker compose pull/up
- health check
- rollback or fail deployment if health check fails

Health endpoints:
- GET /healthz
- GET /readyz

Observability:
- Structured JSON logs
- Request IDs
- Error tracking integration point
- Metrics endpoint or log-based metrics
- Audit trail for admin/restaurant mutations
- Alert on failed Stripe webhooks
- Alert on worker queue backlog
- Alert on database connection errors

Testing:
Add tests for:
- Money calculations
- RNLI contribution calculations
- Order state machine
- Invalid state transitions
- Stripe webhook idempotency
- Restaurant ownership permissions
- Basket one-restaurant rule
- Checkout idempotency
- Notification dispatch job creation
- Admin RNLI reports
- Commission reports

Acceptance criteria:
- A customer can register, browse a restaurant, add items to basket, checkout through Stripe, and see RNLI contribution.
- A paid order is persisted in PostgreSQL with payment, order items, commission, restaurant payable, and RNLI contribution records.
- A restaurant receives the order in its dashboard.
- Restaurant can move order through accepted, preparing, ready, completed.
- Customer receives status notifications.
- Admin can view platform totals, commission totals, RNLI totals, and restaurant onboarding data.
- Invalid order transitions are rejected with 409.
- Stripe webhook retries do not duplicate payments, orders, or RNLI contribution records.
- The system runs via Docker Compose.
- CI/CD workflow exists.
- Security controls are implemented, not just documented.

Deliverables to create in the repository:
1. Working codebase structure.
2. Database migrations.
3. API modules/controllers/services.
4. Frontend PWA pages/components.
5. Restaurant dashboard.
6. Admin dashboard.
7. Docker Compose setup.
8. GitHub Actions workflows.
9. README with local setup, production deployment, environment variables, and operational runbook.
10. docs/architecture.md containing:
    - architecture diagram in PlantUML
    - order flow diagram in PlantUML
    - database schema summary
    - API summary
    - payment lifecycle
    - deployment model
    - scaling notes
    - security notes

Implementation style:
- Use TypeScript strictly where applicable.
- Prefer clear domain modules:
  - auth
  - users
  - restaurants
  - menus
  - baskets
  - orders
  - payments
  - rnli
  - notifications
  - admin
  - audit
- Keep business logic out of controllers.
- Keep payment logic idempotent.
- Keep order state transitions centralized.
- Use database transactions for checkout, payment finalization, and status updates.
- Use explicit DTOs and response schemas.
- Add meaningful comments only where they clarify domain decisions.
- Do not add unnecessary abstractions.

Start by inspecting the existing repository.
Then produce an implementation plan.
Then implement the system incrementally, prioritising:
1. Database schema and migrations
2. API foundation
3. Order/payment/RNLI logic
4. Customer PWA
5. Restaurant dashboard
6. Admin dashboard
7. Docker/CI/CD/docs

8. 
