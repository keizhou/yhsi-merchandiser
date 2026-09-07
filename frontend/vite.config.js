import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/yhsi-merchandiser/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Merchandiser App',
        short_name: 'Merchandiser',
        description: 'Journey plan, cek ketersediaan produk, stock take, dan foto rak untuk tim merchandiser',
        theme_color: '#1f6f5c',
        background_color: '#1f6f5c',
        display: 'standalone',
        start_url: '/yhsi-merchandiser/',
        scope: '/yhsi-merchandiser/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + JS/CSS get cached for offline load; API calls to Apps
        // Script are handled by our own queue/cache in src/lib, not this.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
})
