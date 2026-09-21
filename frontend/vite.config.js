import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import { firebaseMessagingSwPlugin } from './vite.firebaseSwPlugin.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    firebaseMessagingSwPlugin(),
    // Emit .gz / .br next to assets — host/CDN must serve Content-Encoding to benefit.
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      threshold: 1024,
    }),
  ],
  // Strip license banners that leave multi-line "unminified" output for audit tools.
  esbuild: {
    legalComments: 'none',
  },
  build: {
    // Terser compresses more aggressively than esbuild and drops all comments,
    // which resolves common "JS not minified" site-audit false negatives.
    minify: 'terser',
    cssMinify: true,
    sourcemap: false,
    // Do not modulepreload heavy optional chunks (framer / spin-wheel) on first paint.
    modulePreload: {
      resolveDependencies(filename, deps) {
        return deps.filter(
          (dep) =>
            !dep.includes('framer-motion') &&
            !dep.includes('spin-wheel') &&
            !dep.includes('firebase') &&
            !dep.includes('intercom') &&
            !dep.includes('Onboarding') &&
            !dep.includes('BackgroundMusic') &&
            !dep.includes('DashboardSidebar') &&
            !dep.includes('LayoutAuthOverlays')
        )
      },
    },
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@intercom')) return 'intercom'
          if (id.includes('socket.io')) return 'socket'
          if (id.includes('framer-motion')) return 'framer-motion'
          if (id.includes('formik') || id.includes('/yup/')) return 'forms'
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('spin-wheel')) return 'spin-wheel'
          return undefined
        },
      },
    },
  },
  // Always prebundle React as ESM. Serving /node_modules/react/index.js (CJS)
  // makes `import { StrictMode } from 'react'` fail in the browser.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
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
