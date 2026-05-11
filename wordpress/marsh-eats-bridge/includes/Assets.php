<?php
/**
 * Frontend assets.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

if (! defined('ABSPATH')) {
    exit;
}

final class Assets
{
    public const HANDLE = 'marsh-eats-bridge-app';

    public function register(): void
    {
        add_action('wp_enqueue_scripts', [$this, 'register_assets']);
    }

    public function register_assets(): void
    {
        wp_register_style(self::HANDLE, MARSH_EATS_BRIDGE_URL . 'assets/css/app.css', [], MARSH_EATS_BRIDGE_VERSION);
        wp_register_script(self::HANDLE, MARSH_EATS_BRIDGE_URL . 'assets/js/app.js', [], MARSH_EATS_BRIDGE_VERSION, true);
    }

    public static function enqueue(string $view = 'app'): void
    {
        $settings = Settings::get();
        wp_enqueue_style(self::HANDLE);
        wp_enqueue_script(self::HANDLE);

        $config = [
            'restUrl'                 => esc_url_raw(rest_url('marsh-eats/v1')),
            'nonce'                   => wp_create_nonce('wp_rest'),
            'stripePublishableKey'    => sanitize_text_field((string) $settings['stripe_publishable_key']),
            'appBasePath'             => (string) $settings['app_base_path'],
            'restaurantDashboardPath' => (string) $settings['restaurant_dashboard_path'],
            'adminDashboardPath'      => (string) $settings['admin_dashboard_path'],
            'view'                    => sanitize_key($view),
            'routes'                  => Plugin::app_routes(),
        ];

        wp_localize_script(self::HANDLE, 'MarshEatsBridge', $config);
    }
}
