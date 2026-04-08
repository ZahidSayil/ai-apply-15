import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev convenience: proxy Vercel-style routes to the legacy Express backend.
    // On Vercel, `/api/*` is handled by serverless functions and this proxy is ignored.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Convenience endpoints for local debugging.
      '/test-qwen': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/test-groq': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
