import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    strictPort: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:9099', changeOrigin: true },
      '/uploads': { target: 'http://localhost:9099', changeOrigin: true },
    },
  },
})
