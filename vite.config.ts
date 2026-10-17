import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'production-content-security-policy',
      apply: 'build',
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'",
          },
          injectTo: 'head-prepend',
        }]
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['NotoSans-OFL.txt', 'pwa-icon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'DocForensics',
        short_name: 'DocForensics',
        description: 'Local document metadata, structure and writing-style review',
        theme_color: '#1e40af',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: base,
        start_url: base,
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
      },
    }),
  ],
  optimizeDeps: {
    include: ['pdfjs-dist', 'jszip', 'fast-xml-parser'],
  },
  worker: {
    format: 'es',
  },
})
