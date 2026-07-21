import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // the API binds to 127.0.0.1 only — target the IPv4 loopback explicitly
      // so the dev proxy still connects on hosts where localhost resolves to ::1
      '/api': 'http://127.0.0.1:3010',
    },
  },
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
  },
} as any)
