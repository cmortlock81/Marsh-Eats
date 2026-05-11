<?php
/**
 * Main plugin bootstrap.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

if (! defined('ABSPATH')) {
    exit;
}

final class Plugin
{
    private static ?Plugin $instance = null;
    private bool $booted = false;

    public static function instance(): Plugin
    {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function boot(): void
    {
        if ($this->booted) {
            return;
        }
        $this->booted = true;

        (new Settings())->register();
        (new Assets())->register();
        (new RestController())->register();
        (new Shortcodes())->register();

        add_action('init', [$this, 'register_rewrites']);
        add_filter('query_vars', [$this, 'register_query_vars']);
        add_action('template_redirect', [$this, 'render_app_route']);
    }

    public function activate(): void
    {
        $this->register_rewrites();
        flush_rewrite_rules();
    }

    public function deactivate(): void
    {
        flush_rewrite_rules();
    }

    public function register_rewrites(): void
    {
        $settings = Settings::get();
        $base     = trim((string) $settings['app_base_path'], '/');
        if ('' === $base) {
            $base = 'app';
        }

        add_rewrite_rule('^' . preg_quote($base, '#') . '/?$', 'index.php?marsh_eats_app_route=/', 'top');
        add_rewrite_rule('^' . preg_quote($base, '#') . '/(.+?)/?$', 'index.php?marsh_eats_app_route=$matches[1]', 'top');
    }

    /** @param string[] $vars @return string[] */
    public function register_query_vars(array $vars): array
    {
        $vars[] = 'marsh_eats_app_route';
        return $vars;
    }

    public function render_app_route(): void
    {
        $route = get_query_var('marsh_eats_app_route', null);
        if (null === $route || false === $route || '' === $route && ! $this->is_app_home()) {
            return;
        }

        status_header(200);
        nocache_headers();
        Assets::enqueue('app_shell');
        get_header();
        echo Helpers::render_template('app-shell', ['route' => '/' . trim((string) $route, '/')]); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        get_footer();
        exit;
    }

    /** @return array<int,string> */
    public static function app_routes(): array
    {
        return [
            '/app',
            '/app/restaurants',
            '/app/restaurants/{slug}',
            '/app/basket',
            '/app/checkout',
            '/app/order-confirmation/{orderId}',
            '/app/orders',
            '/app/login',
            '/app/account',
            '/app/restaurant/orders',
            '/app/admin',
            '/app/admin/restaurants',
            '/app/admin/reports/rnli',
        ];
    }

    private function is_app_home(): bool
    {
        $settings = Settings::get();
        $path     = trim(parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '', '/');
        return trim((string) $settings['app_base_path'], '/') === $path;
    }
}
