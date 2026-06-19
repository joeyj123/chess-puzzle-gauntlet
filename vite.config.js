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
        // stockfish@16 only ships NNUE builds (no classical/"lite" engine at
        // all — the old candidate list below included paths that don't exist
        // in v16 and silently fell through to the threaded NNUE build).
        //
        // We use the SINGLE-THREADED NNUE build on purpose:
        // - The threaded build (stockfish-nnue-16.js) requires
        //   SharedArrayBuffer, which only exists with COOP/COEP response
        //   headers. We don't set those (no vercel.json), so in production
        //   the worker throws on init and NEVER responds — every "computer
        //   move" silently fell back to ComputerChess.jsx's random-legal-move
        //   fallback, and every Game Review position hit its 20s timeout
        //   (returning score 0 for everything, which is also why both
        //   players showed 100% accuracy — every cpLoss computed as 0).
        // - The threaded build also spawns pthread workers from a hardcoded
        //   "stockfish.worker.js" filename that was never copied to public/,
        //   a second, independent way it would fail to ever load.
        // - The single-threaded build has neither problem (no
        //   SharedArrayBuffer, no extra worker file) and is still the full
        //   NNUE evaluation — just one thread, which is plenty for the short
        //   movetime budgets this app uses.
        const candidates = [
          'stockfish/src/stockfish-nnue-16-single.js',
          'stockfish/src/stockfish-nnue-16-no-simd.js',
          'stockfish/src/stockfish.js',
          'stockfish/stockfish.js',
        ]
        let copied = false
        for (const candidate of candidates) {
          try {
            const src = require.resolve(candidate)
            copyFileSync(src, resolve('public/stockfish.js'))
            console.log('[vite] copied stockfish from', candidate)

            // The engine's wasm loader defaults to fetching a literal,
            // hardcoded filename (e.g. "stockfish-nnue-16-single.wasm") next
            // to wherever the worker script itself was loaded from — it does
            // NOT derive this name from the renamed stockfish.js path. So we
            // must also place the matching .wasm file under its own original
            // name in public/, or every search silently times out.
            const wasmSrc = src.replace(/\.js$/, '.wasm')
            const wasmName = wasmSrc.split(/[\\/]/).pop()
            copyFileSync(wasmSrc, resolve('public', wasmName))
            console.log('[vite] copied stockfish wasm as', wasmName)

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
