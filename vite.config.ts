import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'assets/apple-touch-icon.png'],
      manifest: {
        name: 'DEVFORGE · 独立游戏开发学习舱',
        short_name: 'DEVFORGE',
        description: '用自由积木搭建你的独立游戏开发学习工作台。',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0d0b',
        theme_color: '#0a0d0b',
        categories: ['productivity', 'education'],
        icons: [
          {
            src: '/assets/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/assets/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/assets/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'devforge-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2200,
  },
});
