<?php
/**
 * WordPress admin settings.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

if (! defined('ABSPATH')) {
    exit;
}

final class Settings
{
    public const OPTION_NAME = 'marsh_eats_bridge_settings';

    /** @return array<string,mixed> */
    public static function defaults(): array
    {
        return [
            'api_base_url'              => '',
            'stripe_publishable_key'    => '',
            'debug_logging'             => false,
            'app_base_path'             => '/app',
            'restaurant_dashboard_path' => '/app/restaurant/orders',
            'admin_dashboard_path'      => '/app/admin',
            'timeout'                   => 15,
        ];
    }

    /** @return array<string,mixed> */
    public static function get(): array
    {
        $stored = get_option(self::OPTION_NAME, []);
        return wp_parse_args(is_array($stored) ? $stored : [], self::defaults());
    }

    public function register(): void
    {
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
    }

    public function add_settings_page(): void
    {
        add_options_page(
            __('Marsh Eats Bridge', 'marsh-eats-bridge'),
            __('Marsh Eats Bridge', 'marsh-eats-bridge'),
            'manage_options',
            'marsh-eats-bridge',
            [$this, 'render_page']
        );
    }

    public function register_settings(): void
    {
        register_setting(
            'marsh_eats_bridge',
            self::OPTION_NAME,
            [
                'type'              => 'array',
                'sanitize_callback' => [$this, 'sanitize'],
                'default'           => self::defaults(),
            ]
        );

        add_settings_section(
            'marsh_eats_bridge_api',
            __('API integration', 'marsh-eats-bridge'),
            static function (): void {
                echo '<p>' . esc_html__('Configure the Marsh Eats API bridge. WordPress stores only connection settings; marketplace state remains in the Marsh Eats API.', 'marsh-eats-bridge') . '</p>';
            },
            'marsh-eats-bridge'
        );

        $fields = [
            'api_base_url'              => __('API Base URL', 'marsh-eats-bridge'),
            'stripe_publishable_key'    => __('Stripe Publishable Key', 'marsh-eats-bridge'),
            'app_base_path'             => __('App Base Path', 'marsh-eats-bridge'),
            'restaurant_dashboard_path' => __('Restaurant Dashboard Path', 'marsh-eats-bridge'),
            'admin_dashboard_path'      => __('Admin Dashboard Path', 'marsh-eats-bridge'),
        ];

        foreach ($fields as $key => $label) {
            add_settings_field($key, $label, [$this, 'render_text_field'], 'marsh-eats-bridge', 'marsh_eats_bridge_api', ['key' => $key]);
        }

        add_settings_field('debug_logging', __('Enable Debug Logging', 'marsh-eats-bridge'), [$this, 'render_checkbox_field'], 'marsh-eats-bridge', 'marsh_eats_bridge_api', ['key' => 'debug_logging']);
    }

    /** @param mixed $input */
    public function sanitize($input): array
    {
        $input    = is_array($input) ? $input : [];
        $current  = self::get();
        $settings = self::defaults();

        $api_base_url = isset($input['api_base_url']) ? esc_url_raw(trim((string) wp_unslash($input['api_base_url']))) : '';
        if ('' !== $api_base_url && wp_http_validate_url($api_base_url)) {
            $settings['api_base_url'] = untrailingslashit($api_base_url);
        } else {
            $settings['api_base_url'] = '' === $api_base_url ? '' : (string) $current['api_base_url'];
            if ('' !== $api_base_url) {
                add_settings_error(self::OPTION_NAME, 'api_base_url', __('API Base URL must be a valid http(s) URL.', 'marsh-eats-bridge'));
            }
        }

        $stripe_key = isset($input['stripe_publishable_key']) ? sanitize_text_field(wp_unslash((string) $input['stripe_publishable_key'])) : '';
        $settings['stripe_publishable_key'] = preg_match('/^pk_(test|live)_[A-Za-z0-9_]+$/', $stripe_key) ? $stripe_key : sanitize_text_field($stripe_key);
        $settings['debug_logging']          = ! empty($input['debug_logging']);
        $settings['app_base_path']          = Helpers::normalise_path((string) ($input['app_base_path'] ?? ''), '/app');
        $settings['restaurant_dashboard_path'] = Helpers::normalise_path((string) ($input['restaurant_dashboard_path'] ?? ''), '/app/restaurant/orders');
        $settings['admin_dashboard_path']      = Helpers::normalise_path((string) ($input['admin_dashboard_path'] ?? ''), '/app/admin');
        $settings['timeout']                   = 15;

        return $settings;
    }

    /** @param array<string,string> $args */
    public function render_text_field(array $args): void
    {
        $settings = self::get();
        $key      = $args['key'];
        printf(
            '<input type="text" class="regular-text" id="%1$s" name="%2$s[%1$s]" value="%3$s" />',
            esc_attr($key),
            esc_attr(self::OPTION_NAME),
            esc_attr((string) ($settings[$key] ?? ''))
        );
    }

    /** @param array<string,string> $args */
    public function render_checkbox_field(array $args): void
    {
        $settings = self::get();
        $key      = $args['key'];
        printf(
            '<label><input type="checkbox" id="%1$s" name="%2$s[%1$s]" value="1" %3$s /> %4$s</label>',
            esc_attr($key),
            esc_attr(self::OPTION_NAME),
            checked(! empty($settings[$key]), true, false),
            esc_html__('Write sanitised API request diagnostics to the WordPress debug log.', 'marsh-eats-bridge')
        );
    }

    public function render_page(): void
    {
        if (! current_user_can('manage_options')) {
            return;
        }
        echo '<div class="wrap"><h1>' . esc_html__('Marsh Eats Bridge', 'marsh-eats-bridge') . '</h1><form method="post" action="options.php">';
        settings_fields('marsh_eats_bridge');
        do_settings_sections('marsh-eats-bridge');
        submit_button();
        echo '</form></div>';
    }
}
