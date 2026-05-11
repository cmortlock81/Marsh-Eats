<?php
/**
 * Marsh Eats API client.
 *
 * @package MarshEats\Bridge
 */

declare(strict_types=1);

namespace MarshEats\Bridge;

use WP_Error;

if (! defined('ABSPATH')) {
    exit;
}

final class ApiClient
{
    /** @var array<string,mixed> */
    private array $settings;

    public function __construct(?array $settings = null)
    {
        $this->settings = $settings ?? Settings::get();
    }

    /** @param array<string,mixed> $query */
    public function get(string $path, array $query = [], string $authorization = ''): array|WP_Error
    {
        return $this->request('GET', $path, null, $query, $authorization);
    }

    /** @param array<string,mixed> $body */
    public function post(string $path, array $body = [], string $authorization = ''): array|WP_Error
    {
        return $this->request('POST', $path, $body, [], $authorization);
    }

    /** @param array<string,mixed> $body */
    public function patch(string $path, array $body = [], string $authorization = ''): array|WP_Error
    {
        return $this->request('PATCH', $path, $body, [], $authorization);
    }

    /** @param array<string,mixed> $query */
    public function delete(string $path, array $query = [], string $authorization = ''): array|WP_Error
    {
        return $this->request('DELETE', $path, null, $query, $authorization);
    }

    /** @param array<string,mixed>|null $body @param array<string,mixed> $query */
    public function request(string $method, string $path, ?array $body = null, array $query = [], string $authorization = ''): array|WP_Error
    {
        $base_url = isset($this->settings['api_base_url']) ? (string) $this->settings['api_base_url'] : '';
        if ('' === $base_url || ! wp_http_validate_url($base_url)) {
            return new WP_Error('marsh_eats_api_not_configured', __('Marsh Eats API Base URL is not configured.', 'marsh-eats-bridge'), ['status' => 500]);
        }

        $url = untrailingslashit($base_url) . '/' . ltrim($path, '/');
        if (! empty($query)) {
            $url = add_query_arg($this->sanitize_query($query), $url);
        }

        $headers = [
            'Accept'       => 'application/json',
            'Content-Type' => 'application/json',
        ];

        $authorization = Helpers::clean_bearer_header($authorization);
        if ('' !== $authorization) {
            $headers['Authorization'] = $authorization;
        }

        $args = [
            'method'      => strtoupper($method),
            'timeout'     => absint($this->settings['timeout'] ?? 15) ?: 15,
            'headers'     => $headers,
            'redirection' => 3,
        ];

        if (null !== $body) {
            $args['body'] = wp_json_encode(Helpers::sanitize_recursive($body));
        }

        $this->debug('request', ['method' => $args['method'], 'url' => $url, 'hasAuthorization' => '' !== $authorization]);
        $response = wp_remote_request($url, $args);

        if (is_wp_error($response)) {
            $this->debug('transport_error', ['message' => $response->get_error_message()]);
            return new WP_Error('marsh_eats_api_transport_error', __('Unable to reach Marsh Eats API.', 'marsh-eats-bridge'), ['status' => 502, 'details' => $response->get_error_message()]);
        }

        $status_code = (int) wp_remote_retrieve_response_code($response);
        $raw_body    = (string) wp_remote_retrieve_body($response);
        $decoded     = '' === $raw_body ? null : json_decode($raw_body, true);

        if (JSON_ERROR_NONE !== json_last_error() && '' !== $raw_body) {
            $this->debug('invalid_json', ['status' => $status_code]);
            return new WP_Error('marsh_eats_api_invalid_json', __('Marsh Eats API returned an invalid response.', 'marsh-eats-bridge'), ['status' => 502]);
        }

        if ($status_code < 200 || $status_code >= 300) {
            $message = is_array($decoded) && isset($decoded['error']) ? sanitize_text_field((string) $decoded['error']) : __('Marsh Eats API request failed.', 'marsh-eats-bridge');
            $this->debug('api_error', ['status' => $status_code, 'message' => $message]);
            return new WP_Error('marsh_eats_api_error', $message, ['status' => $status_code, 'api' => is_array($decoded) ? $decoded : null]);
        }

        return is_array($decoded) ? $decoded : ['ok' => true];
    }

    /** @param array<string,mixed> $query @return array<string,mixed> */
    private function sanitize_query(array $query): array
    {
        $clean = [];
        foreach ($query as $key => $value) {
            if (null === $value || '' === $value) {
                continue;
            }
            $clean[sanitize_key((string) $key)] = is_scalar($value) ? sanitize_text_field(wp_unslash((string) $value)) : $value;
        }
        return $clean;
    }

    /** @param array<string,mixed> $context */
    private function debug(string $event, array $context): void
    {
        if (empty($this->settings['debug_logging'])) {
            return;
        }
        unset($context['authorization'], $context['token'], $context['accessToken']);
        error_log('[Marsh Eats Bridge] ' . $event . ' ' . wp_json_encode($context)); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }
}
