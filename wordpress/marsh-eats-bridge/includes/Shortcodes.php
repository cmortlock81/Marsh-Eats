<?php
/**
 * Frontend shortcodes.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

if (! defined('ABSPATH')) {
    exit;
}

final class Shortcodes
{
    /** @var array<string,string> */
    private array $shortcodes = [
        'marsh_eats_app'                  => 'app-shell',
        'marsh_eats_restaurants'          => 'restaurants-list',
        'marsh_eats_restaurant_menu'      => 'restaurant-menu',
        'marsh_eats_basket'               => 'basket',
        'marsh_eats_checkout'             => 'checkout',
        'marsh_eats_order_confirmation'   => 'order-confirmation',
        'marsh_eats_restaurant_dashboard' => 'restaurant-dashboard',
        'marsh_eats_admin_dashboard'      => 'admin-dashboard',
    ];

    public function register(): void
    {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_for_shortcode_pages']);

        foreach ($this->shortcodes as $tag => $template) {
            add_shortcode($tag, function (array|string $atts = []) use ($template): string {
                return $this->render($template, $atts);
            });
        }
    }


    public function enqueue_for_shortcode_pages(): void
    {
        if (is_admin()) {
            return;
        }

        $post = get_post();
        if (! $post instanceof \WP_Post) {
            return;
        }

        foreach (array_keys($this->shortcodes) as $tag) {
            if (has_shortcode((string) $post->post_content, $tag)) {
                Assets::enqueue('shortcode');
                return;
            }
        }
    }

    /** @param array<string,mixed>|string $atts */
    private function render(string $template, array|string $atts): string
    {
        $atts = shortcode_atts(
            [
                'restaurant_id'   => '',
                'restaurant_slug' => '',
                'order_id'        => '',
            ],
            is_array($atts) ? $atts : [],
            'marsh_eats_' . str_replace('-', '_', $template)
        );

        Assets::enqueue(str_replace('-', '_', $template));
        return Helpers::render_template($template, ['atts' => $atts]);
    }
}
