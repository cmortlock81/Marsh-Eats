<?php
/**
 * Plugin Name: Marsh Eats Bridge
 * Description: WordPress bridge for the Marsh Eats API and Mortify /app shell.
 * Version: 0.1.0
 * Requires PHP: 8.1
 * Author: Marsh Eats
 * Text Domain: marsh-eats-bridge
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

if (! defined('ABSPATH')) {
    exit;
}

define('MARSH_EATS_BRIDGE_VERSION', '0.1.0');
define('MARSH_EATS_BRIDGE_FILE', __FILE__);
define('MARSH_EATS_BRIDGE_DIR', plugin_dir_path(__FILE__));
define('MARSH_EATS_BRIDGE_URL', plugin_dir_url(__FILE__));

spl_autoload_register(
    static function (string $class): void {
        $prefix = 'MarshEats\\Bridge\\';
        if (0 !== strpos($class, $prefix)) {
            return;
        }

        $relative = substr($class, strlen($prefix));
        $file     = MARSH_EATS_BRIDGE_DIR . 'includes/' . str_replace('\\', '/', $relative) . '.php';

        if (is_readable($file)) {
            require_once $file;
        }
    }
);

register_activation_hook(
    __FILE__,
    static function (): void {
        \MarshEats\Bridge\Plugin::instance()->activate();
    }
);

register_deactivation_hook(
    __FILE__,
    static function (): void {
        \MarshEats\Bridge\Plugin::instance()->deactivate();
    }
);

add_action(
    'plugins_loaded',
    static function (): void {
        \MarshEats\Bridge\Plugin::instance()->boot();
    }
);
