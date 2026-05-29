import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Inject a strict Content-Security-Policy <meta> tag into index.html at PROD
// build time. We skip it in dev because Vite's React Fast Refresh injects
// inline scripts that strict CSP would block.
//
// Note: `frame-ancestors` can't be set via <meta> — only via an HTTP header.
// Configure your prod static host (Nginx, Caddy, etc.) to also send:
//   Content-Security-Policy: frame-ancestors 'none'
//   X-Frame-Options: DENY
function cspMetaPlugin(apiBaseUrl: string): Plugin {
  // Derive the origin we need to allow for fetch/img — if the env var is just
  // a path (e.g. "/api"), same-origin 'self' is enough.
  let apiOrigin = '';
  try {
    apiOrigin = new URL(apiBaseUrl).origin;
  } catch {
    // Path-relative base — no extra origin to allow-list.
  }
  const extra = apiOrigin ? ` ${apiOrigin}` : '';
  const csp = [
    `default-src 'self'`,
    `script-src 'self'`,
    // Vite + many UI libs inject inline <style> tags; allow them.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:${extra}`,
    `font-src 'self' data:`,
    `connect-src 'self'${extra}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL ?? '/api';

  return {
    plugins: [
      react(),
      cspMetaPlugin(apiBase),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Tailoring ERP',
          short_name: 'TailorERP',
          description: 'Multi-tenant tailoring shop management',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: { cacheName: 'api', networkTimeoutSeconds: 5 },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:4000',
        '/uploads': 'http://localhost:4000',
      },
    },
  };
});
