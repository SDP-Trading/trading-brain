import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // El servidor MCP se compila junto al main: out/main/mcp.js
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), mcp: resolve('src/mcp/server.ts') } } }
  },
  preload: { resolve: { alias: shared } },
  renderer: {
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src'), '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
