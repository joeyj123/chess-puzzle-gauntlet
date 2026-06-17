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
        // Try several known locations across stockfish package versions
        // Prefer lite builds over NNUE — much faster on mobile
        const candidates = [
          'stockfish/src/stockfish.js',
          'stockfish/stockfish.js',
          'stockfish/src/stockfish-16.js',
          'stockfish/src/stockfish-nnue-16.js',
        ]
        let copied = false
        for (const candidate of candidates) {
          try {
            const src = require.resolve(candidate)
            copyFileSync(src, resolve('public/stockfish.js'))
            console.log('[vite] copied stockfish from', candidate)
            copied = true
            break
          } catch { /* try next */ }
        }
        if (!copied) {
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
