<?php
/**
 * REST permission helpers.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

use WP_Error;
use WP_REST_Request;

if (! defined('ABSPATH')) {
    exit;
}

final class Auth
{
    public static function public_permission(): bool
    {
        return true;
    }

    public static function nonce_permission(WP_REST_Request $request): bool|WP_Error
    {
        $nonce = (string) $request->get_header('X-WP-Nonce');
        if (wp_verify_nonce($nonce, 'wp_rest')) {
            return true;
        }

        return new WP_Error('marsh_eats_missing_nonce', __('A valid WordPress REST nonce is required.', 'marsh-eats-bridge'), ['status' => 403]);
    }

    public static function bearer_permission(WP_REST_Request $request): bool|WP_Error
    {
        if ('' !== self::authorization($request)) {
            return true;
        }

        return new WP_Error('marsh_eats_missing_token', __('A Marsh Eats access token is required.', 'marsh-eats-bridge'), ['status' => 401]);
    }

    public static function admin_permission(WP_REST_Request $request): bool|WP_Error
    {
        if (! current_user_can('manage_options')) {
            return new WP_Error('marsh_eats_wp_forbidden', __('WordPress administrator privileges are required.', 'marsh-eats-bridge'), ['status' => 403]);
        }

        return self::bearer_permission($request);
    }

    public static function authorization(WP_REST_Request $request): string
    {
        return Helpers::clean_bearer_header($request->get_header('Authorization'));
    }
}
