import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { firebaseMessagingSwPlugin } from './vite.firebaseSwPlugin.js'

/**
 * Admin app is frontend-only. API requests are proxied to the shared backend
 * (partner-platform- /backend) so both user app and admin app use the same API.
 */
export default defineConfig({
  plugins: [react(), firebaseMessagingSwPlugin()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
