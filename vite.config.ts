import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: process.env.VERCEL
    ? '/'
    : process.env.GITHUB_ACTIONS || process.env.GITHUB_PAGES
      ? '/flight-simulator/'
      : mode === 'production'
        ? '/flight-simulator/'
        : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
}))
