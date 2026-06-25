import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:5517',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/providers': {
        target: 'http://127.0.0.1:5516',
        changeOrigin: true,
      },
      '/api/points': {
        target: 'http://127.0.0.1:5512',
        changeOrigin: true,
      },
      '/api/reserve': {
        target: 'http://127.0.0.1:5513',
        changeOrigin: true,
      },
      '/api/reservations': {
        target: 'http://127.0.0.1:5513',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/billing': {
        target: 'http://127.0.0.1:5514',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/payments': {
        target: 'http://127.0.0.1:5515',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/analytics': {
        target: 'http://127.0.0.1:5518',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/map': {
        target: 'http://127.0.0.1:5519',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
