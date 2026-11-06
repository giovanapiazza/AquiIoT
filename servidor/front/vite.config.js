import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// /api vai ao backend na mesma máquina (porta 3000), então a interface funciona
// por qualquer endereço, inclusive https://raspberrypi.tail656d5e.ts.net
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000'
const server = {
  host: true,
  allowedHosts: ['.ts.net'],
  proxy: { '/api': BACKEND },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server,
  preview: server,
})
