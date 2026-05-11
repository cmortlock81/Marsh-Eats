# Marsh Eats Bridge

`marsh-eats-bridge` is a production-shaped WordPress plugin that lets WordPress/Mortify act as the Marsh Eats marketing site and `/app` shell while the Marsh Eats API remains the source of truth.

```text
WordPress / Mortify
    ↓
Marsh Eats Bridge Plugin
    ↓
Marsh Eats API
    ↓
PostgreSQL / Redis / Stripe / Firebase
```

The plugin does **not** use WooCommerce, store marketplace entities as WordPress posts, process payments in PHP, or duplicate restaurant/menu/order/payment/accounting state in WordPress.

## Installation

1. Copy `wordpress/marsh-eats-bridge` into `wp-content/plugins/marsh-eats-bridge`.
2. Activate **Marsh Eats Bridge** in WordPress Admin → Plugins.
3. Visit **Settings → Marsh Eats Bridge** and save the API and app settings.
4. Ensure WordPress pretty permalinks are enabled so `/app` rewrite rules work.

## Admin settings

The plugin stores only connection/configuration options in `marsh_eats_bridge_settings`:

- API Base URL, for example `http://localhost:3000` in local development.
- Stripe Publishable Key, for example `pk_test_...`; secret keys stay in the Marsh Eats API.
- Enable Debug Logging for sanitised WordPress debug-log diagnostics.
- App Base Path, default `/app`.
- Restaurant Dashboard Path, default `/app/restaurant/orders`.
- Admin Dashboard Path, default `/app/admin`.

The API base URL must be a valid HTTP(S) URL. App paths must start with `/`.

## Required API URL

Set **API Base URL** to the Marsh Eats API origin only, without `/api/v1`. The plugin maps WordPress REST proxy routes under `/wp-json/marsh-eats/v1` to the Marsh Eats API.

Local example:

```text
http://localhost:3000
```

## Shortcodes

Use shortcodes in Mortify or WordPress pages when you want to mount a specific shell manually:

```text
[marsh_eats_app]
[marsh_eats_restaurants]
[marsh_eats_restaurant_menu restaurant_slug="whitstable-harbour-kitchen"]
[marsh_eats_basket]
[marsh_eats_checkout]
[marsh_eats_order_confirmation order_id="..."]
[marsh_eats_restaurant_dashboard]
[marsh_eats_admin_dashboard]
```

Templates output escaped containers only. Runtime data loads through `assets/js/app.js` and the WordPress REST proxy.

## `/app` route setup

On activation the plugin registers rewrite rules for:

- `/app`
- `/app/restaurants`
- `/app/restaurants/{slug}`
- `/app/basket`
- `/app/checkout`
- `/app/order-confirmation/{orderId}`
- `/app/orders`
- `/app/login`
- `/app/account`
- `/app/restaurant/orders`
- `/app/admin`
- `/app/admin/restaurants`
- `/app/admin/reports/rnli`

Rewrite rules are flushed only on activation/deactivation. If you change the app base path, deactivate/reactivate the plugin or visit WordPress permalink settings to refresh rules.

## REST proxy endpoints

All routes are exposed under `/wp-json/marsh-eats/v1`.

### Public customer routes

- `GET /restaurants`
- `GET /restaurants/{id}`
- `GET /restaurants/slug/{slug}`
- `GET /restaurants/{id}/menu`

### Nonce-protected customer/auth routes

- `POST /orders`
- `POST /orders/{orderId}/payment-intents`
- `POST /auth/login`
- `POST /auth/register`

### Token-protected routes

- `GET /auth/me`
- `GET /orders/{orderId}`
- `GET /orders/{orderId}/status`
- `GET /restaurants/{restaurantId}/orders`
- `PATCH /orders/{orderId}/status`
- `GET /restaurants/{restaurantId}/orders/events-url`

### WordPress-admin + Marsh-Eats-token routes

- `GET /admin/restaurants`
- `POST /admin/restaurants`
- `GET /admin/restaurants/{id}`
- `PATCH /admin/restaurants/{id}`
- `DELETE /admin/restaurants/{id}`
- `GET /admin/restaurants/{restaurantId}/menu`
- `POST /admin/restaurants/{restaurantId}/menu/categories`
- `PATCH /admin/menu/categories/{categoryId}`
- `DELETE /admin/menu/categories/{categoryId}`
- `POST /admin/menu/categories/{categoryId}/items`
- `PATCH /admin/menu/items/{itemId}`
- `DELETE /admin/menu/items/{itemId}`
- `GET /admin/reports/rnli`

Admin proxy routes require both the WordPress `manage_options` capability and a Marsh Eats bearer token. The Marsh Eats API remains the final authority for business permissions.

## Local development

1. Run the Marsh Eats API locally from the repository root:

   ```bash
   npm run dev --workspace @marsh-eats/api
   ```

2. In WordPress, configure **API Base URL** as `http://localhost:3000`.
3. Configure a Stripe publishable test key (`pk_test_...`) if checkout is needed.
4. Open `/app/restaurants` to load restaurants through the proxy.

## Stripe test notes

Stripe.js loads only during checkout. WordPress receives only the publishable key and PaymentIntent client secret. The Marsh Eats API creates PaymentIntents with the server-calculated order total.

Use Stripe test card `4242 4242 4242 4242`, any future expiry, and any CVC for the happy path.

## Security model

- Public restaurant/menu routes are readable without auth.
- Order creation, payment intent creation, login, and registration require WordPress REST nonces.
- Dashboard routes require a Marsh Eats bearer token from browser `localStorage`.
- Admin routes require WordPress `manage_options` plus the Marsh Eats admin token required by the API.
- Tokens are forwarded to the API using `Authorization: Bearer ...`.
- Frontend role checks are UX only; the API remains authoritative.
- API secrets and Stripe secret keys are never stored in WordPress.

## Known limitations

- MVP token storage uses browser `localStorage` to keep setup simple.
- The restaurant dashboard asks for a restaurant UUID until account restaurant discovery is exposed through the bridge.
- Some admin menu-management screens are intentionally basic and should be expanded before broad operations usage.
- WordPress proxy routes assume matching Marsh Eats API endpoints or API aliases exist for all listed admin/menu/report routes.

## Future production improvements

- Move access tokens to HTTP-only secure cookies.
- Add a server-side token exchange and refresh-token rotation.
- Add account restaurant discovery to the bridge frontend.
- Add richer admin forms for owner assignment and menu editing ergonomics.
- Add Playwright/E2E coverage against a running WordPress + Marsh Eats API stack.
