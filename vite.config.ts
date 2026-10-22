import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    strictPort: true,
    port: 5173,
    // vite 8 默认只绑 ::1，导致 127.0.0.1 访问被拒，显式监听全部地址
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:9099', changeOrigin: true },
      '/uploads': { target: 'http://localhost:9099', changeOrigin: true },
      '/_AMapService': { target: 'http://localhost:9099', changeOrigin: true },
    },
  },
})
