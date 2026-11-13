import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'node:url';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const configRoot = fileURLToPath(new URL('.', import.meta.url));

function loadNetworkConfig() {
  try {
    const configPath = path.resolve(configRoot, 'network.config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // fallback to defaults
  }
  return {
    domainName: 'BHS-Assment-portal',
    host: '0.0.0.0',
    port: 3000,
    allowAllLanHosts: true,
    allowedHosts: ['BHS-Assment-portal', 'localhost', '127.0.0.1'],
  };
}

export default defineConfig(({ command, mode }) => {
  const netConfig = loadNetworkConfig();
  const env = loadEnv(mode, process.cwd(), '');
  return {
    envPrefix: ['VITE_', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'],
    define: {
      'process.env.NODE_ENV': JSON.stringify(command === 'build' ? 'production' : 'development'),
      'import.meta.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || ''),
      'import.meta.env.SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY || '')
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'default-school-logo.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'EduGrade - Continuous Assessment & Academic Report Card Platform',
          short_name: 'EduGrade',
          description:
            'Comprehensive school continuous assessment, HOD document review, and academic report card portal.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': configRoot,
      },
    },
    server: {
      host: netConfig.host || '0.0.0.0',
      port: Number(netConfig.port || 3000),
      allowedHosts: netConfig.allowAllLanHosts ? true : netConfig.allowedHosts,
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
