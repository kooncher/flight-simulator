import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/flight-simulator/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
}))
