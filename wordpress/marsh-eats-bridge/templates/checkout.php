<?php
/** Template shell for Checkout. */
declare(strict_types=1);
if (! defined('ABSPATH')) {
    exit;
}
$atts = isset($template_data['atts']) && is_array($template_data['atts']) ? $template_data['atts'] : [];
$route = isset($template_data['route']) ? (string) $template_data['route'] : '';
?>
<div class="marsh-eats-app" data-marsh-eats-view="<?php echo esc_attr('checkout'); ?>" data-route="<?php echo esc_attr($route); ?>" data-restaurant-id="<?php echo esc_attr((string) ($atts['restaurant_id'] ?? '')); ?>" data-restaurant-slug="<?php echo esc_attr((string) ($atts['restaurant_slug'] ?? '')); ?>" data-order-id="<?php echo esc_attr((string) ($atts['order_id'] ?? '')); ?>">
    <div class="marsh-eats-shell">
        <header class="marsh-eats-header">
            <a class="marsh-eats-brand" href="<?php echo esc_url(home_url('/app')); ?>"><?php echo esc_html__('Marsh Eats', 'marsh-eats-bridge'); ?></a>
            <nav class="marsh-eats-top-nav" aria-label="<?php echo esc_attr__('Marsh Eats navigation', 'marsh-eats-bridge'); ?>">
                <a href="<?php echo esc_url(home_url('/app/restaurants')); ?>"><?php echo esc_html__('Restaurants', 'marsh-eats-bridge'); ?></a>
                <a href="<?php echo esc_url(home_url('/app/basket')); ?>"><?php echo esc_html__('Basket', 'marsh-eats-bridge'); ?></a>
                <a href="<?php echo esc_url(home_url('/app/login')); ?>"><?php echo esc_html__('Login', 'marsh-eats-bridge'); ?></a>
            </nav>
        </header>
        <main class="marsh-eats-main" tabindex="-1">
            <section class="marsh-eats-panel" data-marsh-eats-mount>
                <p class="marsh-eats-eyebrow"><?php echo esc_html__('Checkout', 'marsh-eats-bridge'); ?></p>
                <h1><?php echo esc_html__('Checkout', 'marsh-eats-bridge'); ?></h1>
                <p><?php echo esc_html__('Orders and payments are created by the Marsh Eats API.', 'marsh-eats-bridge'); ?></p>
                <div class="marsh-eats-loading"><?php echo esc_html__('Loading Marsh Eats…', 'marsh-eats-bridge'); ?></div>
            </section>
        </main>
        <nav class="marsh-eats-bottom-nav" aria-label="<?php echo esc_attr__('Marsh Eats app tabs', 'marsh-eats-bridge'); ?>">
            <a href="<?php echo esc_url(home_url('/app/restaurants')); ?>">🏠 <span><?php echo esc_html__('Browse', 'marsh-eats-bridge'); ?></span></a>
            <a href="<?php echo esc_url(home_url('/app/orders')); ?>">🧾 <span><?php echo esc_html__('Orders', 'marsh-eats-bridge'); ?></span></a>
            <a href="<?php echo esc_url(home_url('/app/basket')); ?>">🛒 <span><?php echo esc_html__('Basket', 'marsh-eats-bridge'); ?></span></a>
            <a href="<?php echo esc_url(home_url('/app/account')); ?>">👤 <span><?php echo esc_html__('Account', 'marsh-eats-bridge'); ?></span></a>
        </nav>
    </div>
</div>
