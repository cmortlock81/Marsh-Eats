<?php
/**
 * Shared helper methods.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

if (! defined('ABSPATH')) {
    exit;
}

final class Helpers
{
    public static function template_path(string $template): string
    {
        $template = sanitize_file_name($template);
        return MARSH_EATS_BRIDGE_DIR . 'templates/' . $template . '.php';
    }

    /**
     * @param array<string,mixed> $data
     */
    public static function render_template(string $template, array $data = []): string
    {
        $path = self::template_path($template);
        if (! is_readable($path)) {
            return '';
        }

        ob_start();
        $template_data = $data;
        include $path;
        return (string) ob_get_clean();
    }

    public static function normalise_path(string $path, string $fallback): string
    {
        $path = trim($path);
        if ('' === $path || '/' !== $path[0]) {
            return $fallback;
        }

        $path = '/' . trim($path, '/');
        return '/' === $path ? $fallback : $path;
    }

    public static function clean_bearer_header(?string $authorization): string
    {
        $authorization = is_string($authorization) ? trim(wp_unslash($authorization)) : '';
        if (! preg_match('/^Bearer\s+([A-Za-z0-9._~+\/=\-]+)$/', $authorization, $matches)) {
            return '';
        }

        return 'Bearer ' . sanitize_text_field($matches[1]);
    }

    /**
     * @param mixed $value
     * @return mixed
     */
    public static function sanitize_recursive($value)
    {
        if (is_array($value)) {
            $clean = [];
            foreach ($value as $key => $item) {
                $clean[is_string($key) ? sanitize_key($key) : $key] = self::sanitize_recursive($item);
            }
            return $clean;
        }

        if (is_bool($value) || is_int($value) || is_float($value) || null === $value) {
            return $value;
        }

        return is_string($value) ? sanitize_text_field(wp_unslash($value)) : $value;
    }
}
