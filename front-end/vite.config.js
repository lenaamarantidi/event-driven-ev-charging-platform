import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendHost = process.env.VITE_BACKEND_HOST || '127.0.0.1'
const backendBasePort = Number(process.env.BACKEND_BASE_PORT || 5511)
const backendTarget = (offset) => `http://${backendHost}:${backendBasePort + offset}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/auth': {
        target: backendTarget(6),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/providers': {
        target: backendTarget(5),
        changeOrigin: true,
      },
      '/api/points': {
        target: backendTarget(1),
        changeOrigin: true,
      },
      '/api/reserve': {
        target: backendTarget(2),
        changeOrigin: true,
      },
      '/api/reservations': {
        target: backendTarget(2),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/billing': {
        target: backendTarget(3),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/payments': {
        target: backendTarget(4),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/analytics': {
        target: backendTarget(7),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/map': {
        target: backendTarget(8),
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
