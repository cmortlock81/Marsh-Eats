<?php
/**
 * WordPress REST proxy endpoints.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

if (! defined('ABSPATH')) {
    exit;
}

final class RestController
{
    private const NAMESPACE = 'marsh-eats/v1';

    private ApiClient $api;

    public function __construct(?ApiClient $api = null)
    {
        $this->api = $api ?? new ApiClient();
    }

    public function register(): void
    {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes(): void
    {
        $this->proxy('GET', '/restaurants', '/api/v1/restaurants', [Auth::class, 'public_permission']);
        $this->proxy('GET', '/restaurants/(?P<id>[a-f0-9-]{36})', '/api/v1/restaurants/{id}', [Auth::class, 'public_permission']);
        $this->proxy('GET', '/restaurants/slug/(?P<slug>[a-z0-9-]+)', '/api/v1/restaurants/slug/{slug}', [Auth::class, 'public_permission']);
        $this->proxy('GET', '/restaurants/(?P<id>[a-f0-9-]{36})/menu', '/api/v1/restaurants/{id}/menu', [Auth::class, 'public_permission']);

        $this->proxy('POST', '/orders', '/api/v1/orders', [Auth::class, 'nonce_permission']);
        $this->proxy('POST', '/orders/(?P<orderId>[a-f0-9-]{36})/payment-intents', '/api/v1/orders/{orderId}/payment-intents', [Auth::class, 'nonce_permission']);
        $this->proxy('GET', '/orders/(?P<orderId>[a-f0-9-]{36})', '/api/v1/orders/{orderId}', [Auth::class, 'bearer_permission']);
        $this->proxy('GET', '/orders/(?P<orderId>[a-f0-9-]{36})/status', '/api/v1/orders/{orderId}/status', [Auth::class, 'bearer_permission']);

        $this->proxy('POST', '/auth/login', '/api/v1/auth/login', [Auth::class, 'nonce_permission']);
        $this->proxy('POST', '/auth/register', '/api/v1/auth/register', [Auth::class, 'nonce_permission']);
        $this->proxy('GET', '/auth/me', '/api/v1/auth/me', [Auth::class, 'bearer_permission']);

        $this->proxy('GET', '/restaurants/(?P<restaurantId>[a-f0-9-]{36})/orders', '/api/v1/restaurants/{restaurantId}/orders', [Auth::class, 'bearer_permission']);
        $this->proxy('PATCH', '/orders/(?P<orderId>[a-f0-9-]{36})/status', '/api/v1/orders/{orderId}/status', [Auth::class, 'bearer_permission']);
        register_rest_route(
            self::NAMESPACE,
            '/restaurants/(?P<restaurantId>[a-f0-9-]{36})/orders/events-url',
            [
                'methods'             => 'GET',
                'callback'            => [$this, 'events_url'],
                'permission_callback' => [Auth::class, 'bearer_permission'],
                'args'                => ['restaurantId' => ['required' => true, 'sanitize_callback' => 'sanitize_text_field']],
            ]
        );

        $this->proxy('GET', '/admin/restaurants', '/api/v1/admin/restaurants', [Auth::class, 'admin_permission']);
        $this->proxy('POST', '/admin/restaurants', '/api/v1/admin/restaurants', [Auth::class, 'admin_permission']);
        $this->proxy('GET', '/admin/restaurants/(?P<id>[a-f0-9-]{36})', '/api/v1/admin/restaurants/{id}', [Auth::class, 'admin_permission']);
        $this->proxy('PATCH', '/admin/restaurants/(?P<id>[a-f0-9-]{36})', '/api/v1/admin/restaurants/{id}', [Auth::class, 'admin_permission']);
        $this->proxy('DELETE', '/admin/restaurants/(?P<id>[a-f0-9-]{36})', '/api/v1/admin/restaurants/{id}', [Auth::class, 'admin_permission']);
        $this->proxy('GET', '/admin/restaurants/(?P<restaurantId>[a-f0-9-]{36})/menu', '/api/v1/admin/restaurants/{restaurantId}/menu', [Auth::class, 'admin_permission']);
        $this->proxy('POST', '/admin/restaurants/(?P<restaurantId>[a-f0-9-]{36})/menu/categories', '/api/v1/admin/restaurants/{restaurantId}/menu/categories', [Auth::class, 'admin_permission']);
        $this->proxy('PATCH', '/admin/menu/categories/(?P<categoryId>[a-f0-9-]{36})', '/api/v1/admin/menu/categories/{categoryId}', [Auth::class, 'admin_permission']);
        $this->proxy('DELETE', '/admin/menu/categories/(?P<categoryId>[a-f0-9-]{36})', '/api/v1/admin/menu/categories/{categoryId}', [Auth::class, 'admin_permission']);
        $this->proxy('POST', '/admin/menu/categories/(?P<categoryId>[a-f0-9-]{36})/items', '/api/v1/admin/menu/categories/{categoryId}/items', [Auth::class, 'admin_permission']);
        $this->proxy('PATCH', '/admin/menu/items/(?P<itemId>[a-f0-9-]{36})', '/api/v1/admin/menu/items/{itemId}', [Auth::class, 'admin_permission']);
        $this->proxy('DELETE', '/admin/menu/items/(?P<itemId>[a-f0-9-]{36})', '/api/v1/admin/menu/items/{itemId}', [Auth::class, 'admin_permission']);
        $this->proxy('GET', '/admin/reports/rnli', '/api/v1/admin/reports/rnli', [Auth::class, 'admin_permission']);
    }

    /** @param callable $permission */
    private function proxy(string $method, string $wp_route, string $api_path, callable $permission): void
    {
        register_rest_route(
            self::NAMESPACE,
            $wp_route,
            [
                'methods'             => $method,
                'callback'            => function (WP_REST_Request $request) use ($method, $api_path) {
                    return $this->proxy_request($request, $method, $api_path);
                },
                'permission_callback' => $permission,
            ]
        );
    }

    public function proxy_request(WP_REST_Request $request, string $method, string $api_path): WP_REST_Response|WP_Error
    {
        $path   = $this->interpolate_path($api_path, $request);
        $query  = $request->get_query_params();
        $body   = in_array($method, ['POST', 'PATCH'], true) ? $this->body_params($request) : null;
        $auth   = Auth::authorization($request);
        $result = $this->api->request($method, $path, $body, $query, $auth);

        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response($result);
    }

    public function events_url(WP_REST_Request $request): WP_REST_Response|WP_Error
    {
        $settings = Settings::get();
        $base_url = isset($settings['api_base_url']) ? (string) $settings['api_base_url'] : '';
        if ('' === $base_url || ! wp_http_validate_url($base_url)) {
            return new WP_Error('marsh_eats_api_not_configured', __('Marsh Eats API Base URL is not configured.', 'marsh-eats-bridge'), ['status' => 500]);
        }

        $restaurant_id = sanitize_text_field((string) $request['restaurantId']);
        return rest_ensure_response([
            'url' => untrailingslashit($base_url) . '/restaurants/' . rawurlencode($restaurant_id) . '/orders/events',
        ]);
    }

    private function interpolate_path(string $api_path, WP_REST_Request $request): string
    {
        foreach ($request->get_url_params() as $key => $value) {
            $api_path = str_replace('{' . $key . '}', rawurlencode(sanitize_text_field((string) $value)), $api_path);
        }
        return $api_path;
    }

    /** @return array<string,mixed> */
    private function body_params(WP_REST_Request $request): array
    {
        $json = $request->get_json_params();
        if (is_array($json)) {
            return Helpers::sanitize_recursive($json);
        }

        return Helpers::sanitize_recursive($request->get_body_params());
    }
}
