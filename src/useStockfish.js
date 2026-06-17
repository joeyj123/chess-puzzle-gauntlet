/**
 * useStockfish — manages a Stockfish Web Worker.
 *
 * The worker is created lazily (first call to getBestMove or analyzePosition)
 * and lives for the lifetime of the component that owns this hook.
 * Call terminate() on unmount when analysis is happening.
 *
 * /stockfish.js is copied from node_modules/stockfish/src/stockfish.js into
 * public/ by the vite 'copy-stockfish' plugin at build/dev start.
 */

import { useRef, useCallback } from 'react'

// Map our 6 difficulty presets to Stockfish Skill Level (0–20)
// 10 levels evenly spaced 500→2800 (step ≈ 255)
// Skill Level (0-20) and depth are tuned together to hit those targets
export const DIFFICULTY_LEVELS = [
  { label: 'Beginner',         skill: 0,  elo: '500',  depth: 1  },
  { label: 'Novice',           skill: 2,  elo: '750',  depth: 2  },
  { label: 'Casual',           skill: 4,  elo: '1000', depth: 3  },
  { label: 'Intermediate',     skill: 6,  elo: '1250', depth: 5  },
  { label: 'Club',             skill: 9,  elo: '1500', depth: 7  },
  { label: 'Strong Club',      skill: 11, elo: '1750', depth: 9  },
  { label: 'Advanced',         skill: 13, elo: '2000', depth: 11 },
  { label: 'Expert',           skill: 15, elo: '2250', depth: 14 },
  { label: 'Candidate Master', skill: 17, elo: '2500', depth: 16 },
  { label: 'Master',           skill: 20, elo: '2800', depth: 18 },
]

// Centipawn loss → move classification
export function classifyMove(cpLoss) {
  if (cpLoss <= 5)   return { label: 'Best',        symbol: '!',   cls: 'best' }
  if (cpLoss <= 15)  return { label: 'Excellent',   symbol: '!',   cls: 'excellent' }
  if (cpLoss <= 30)  return { label: 'Good',        symbol: '✓',   cls: 'good' }
  if (cpLoss <= 60)  return { label: 'Inaccuracy',  symbol: '?',   cls: 'inaccuracy' }
  if (cpLoss <= 120) return { label: 'Mistake',     symbol: '??',  cls: 'mistake' }
  return                    { label: 'Blunder',     symbol: '???', cls: 'blunder' }
}

// Per-move accuracy score (0–100)
export function moveAccuracy(cpLoss) {
  return Math.max(0, 100 * Math.exp(-cpLoss / 150))
}

export function useStockfish() {
  const workerRef    = useRef(null)
  const callbackRef  = useRef(null)
  const readyRef     = useRef(false)

  function getWorker() {
    if (!workerRef.current) {
      try {
        const w = new Worker('/stockfish.js')
        w.onmessage = (e) => {
          const line = typeof e.data === 'string' ? e.data : ''
          if (line === 'readyok') readyRef.current = true
          if (callbackRef.current) callbackRef.current(line)
        }
        w.postMessage('uci')
        w.postMessage('isready')
        workerRef.current = w
      } catch (err) {
        console.error('[Stockfish] failed to start worker:', err)
        return null
      }
    }
    return workerRef.current
  }

  const send = useCallback((cmd) => {
    const w = getWorker()
    if (w) w.postMessage(cmd)
  }, [])

  const setSkillLevel = useCallback((level) => {
    send(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`)
  }, [send])

  /** Returns best move UCI string (e.g. "e2e4") or null */
  const getBestMove = useCallback((fen, depth = 12) => {
    return new Promise((resolve) => {
      const w = getWorker()
      if (!w) { resolve(null); return }

      callbackRef.current = (line) => {
        if (line.startsWith('bestmove')) {
          callbackRef.current = null
          const mv = line.split(' ')[1]
          resolve(!mv || mv === '(none)' ? null : mv)
        }
      }
      w.postMessage('position fen ' + fen)
      w.postMessage(`go depth ${depth}`)
    })
  }, [])

  /**
   * Analyze a position.
   * Returns { score: number (cp from side-to-move perspective), bestMove: string|null }
   * score is clamped to ±10000 for mate.
   */
  const analyzePosition = useCallback((fen, depth = 10) => {
    return new Promise((resolve) => {
      const w = getWorker()
      if (!w) { resolve({ score: 0, bestMove: null }); return }

      let lastScore = 0
      let lastBestMove = null

      callbackRef.current = (line) => {
        if (line.startsWith('info')) {
          const cpMatch   = line.match(/score cp (-?\d+)/)
          const mateMatch = line.match(/score mate (-?\d+)/)
          const pvMatch   = line.match(/ pv (\w+)/)
          if (cpMatch)   lastScore = parseInt(cpMatch[1])
          if (mateMatch) lastScore = parseInt(mateMatch[1]) > 0 ? 10000 : -10000
          if (pvMatch)   lastBestMove = pvMatch[1]
        }
        if (line.startsWith('bestmove')) {
          callbackRef.current = null
          const mv = line.split(' ')[1]
          if (!lastBestMove && mv && mv !== '(none)') lastBestMove = mv
          resolve({ score: lastScore, bestMove: lastBestMove || null })
        }
      }
      w.postMessage('position fen ' + fen)
      w.postMessage(`go depth ${depth}`)
    })
  }, [])

  const stop = useCallback(() => { send('stop') }, [send])

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
      callbackRef.current = null
    }
  }, [])

  return { getBestMove, analyzePosition, setSkillLevel, stop, terminate, send }
}
