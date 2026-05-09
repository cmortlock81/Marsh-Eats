# Marsh Eats architecture

Marsh Eats is structured as a TypeScript monorepo with mobile-first customer, restaurant, and admin web apps, a REST API, an async worker, PostgreSQL 16 as the marketplace source of truth, Redis-ready infrastructure, Stripe PaymentIntents, Firebase Cloud Messaging, and Docker Compose for Linux VPS/Plesk deployments behind Cloudflare.

## Domain boundaries

- `apps/customer-pwa`: app-like PWA with bottom navigation, manifest, and service worker cache.
- `apps/restaurant-dashboard`: restaurant operational dashboard for availability, menu, and order queues.
- `apps/admin-dashboard`: platform controls for onboarding, commission, RNLI reporting, order search, refunds, and audit log.
- `services/api`: REST API for discovery, menus, checkout, payments, status transitions, Stripe webhooks, and SSE realtime events.
- `services/worker`: listens for order status events and sends Firebase Cloud Messaging notifications.
- `packages/shared`: shared money accounting and order-state-machine rules.

## Accounting

All money is stored as integer pence in GBP. The shared accounting helper computes 8% commission, 1% RNLI allocation, and the restaurant payable. For a `total_pence` of `3200`, the commission is `256`, RNLI contribution is `32`, and restaurant payable is `2912`.

## Order state enforcement

The API rejects invalid state changes with HTTP `409 Conflict` via the shared state machine. Every accepted transition is recorded in `order_status_events`, and status changes emit realtime events for dashboards and notification workers.

## Payments

Stripe PaymentIntents are created with idempotency keys and automatic payment methods for card, Apple Pay, and Google Pay compatibility. Stripe webhooks verify signatures before marking orders paid or failed. The platform stores Stripe identifiers only and never stores card data.
