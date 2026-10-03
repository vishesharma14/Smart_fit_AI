import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Allow Cloudflare Quick Tunnel hostnames (a new random *.trycloudflare.com name each run).
    // The leading dot matches only subdomains of trycloudflare.com; all other hosts stay blocked.
    allowedHosts: ['.trycloudflare.com'],
  },
})
