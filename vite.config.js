import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-stockfish',
      buildStart() {
        try {
          // require.resolve('stockfish') gives node_modules/stockfish/src/stockfish.js
          const src = require.resolve('stockfish')
          copyFileSync(src, resolve('public/stockfish.js'))
        } catch {
          console.warn('[vite] stockfish not found in node_modules — run npm install')
        }
      },
    },
  ],
  base: './',
  build: {
    emptyOutDir: true,
  },
})
