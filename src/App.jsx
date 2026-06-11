import { useState, useEffect, useCallback, useRef } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { loadPuzzles, getShuffledPuzzles } from './data/puzzles'
import './App.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

function uciToObj(uci) {
  return {
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci[4] } : {}),
  }
}

function getMateHint(themes = []) {
  for (let n = 1; n <= 5; n++) {
    if (themes.includes(`mateIn${n}`)) return `Mate in ${n}`
  }
  return 'Find the best move'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function App() {
  const [queue,       setQueue]       = useState([])
  const [qIdx,        setQIdx]        = useState(0)
  const [game,        setGame]        = useState(null)
  const [puzzle,      setPuzzle]      = useState(null)
  const [moveIdx,     setMoveIdx]     = useState(1)
  const [status,      setStatus]      = useState('idle')
  // status: 'idle' | 'playing' | 'thinking' | 'wrong' | 'solved'
  const [msg,         setMsg]         = useState('')
  const [highlights,  setHighlights]  = useState({})
  const [streak,      setStreak]      = useState(0)
  const [totalSolved, setTotalSolved] = useState(0)
  const [orientation, setOrientation] = useState('white')
  const [loadError,   setLoadError]   = useState(null)
  const timerRef = useRef(null)

  // ── Load a puzzle ──────────────────────────────────────────────────────────

  const loadPuzzle = useCallback((p) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const chess = new Chess(p.fen)
    const setupMove = uciToObj(p.moves[0])
    chess.move(setupMove)
    setGame(new Chess(chess.fen()))
    setPuzzle(p)
    setMoveIdx(1)
    setStatus('playing')
    setMsg('')
    setHighlights({})
    setOrientation(chess.turn() === 'w' ? 'white' : 'black')
  }, [])

  useEffect(() => {
    let cancelled = false
    loadPuzzles()
      .then((all) => {
        if (cancelled) return
        const q = getShuffledPuzzles(all)
        setQueue(q)
        if (q.length > 0) loadPuzzle(q[0])
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [loadPuzzle])

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (!queue.length) return
    const next = (qIdx + 1) % queue.length
    setQIdx(next)
    loadPuzzle(queue[next])
  }, [queue, qIdx, loadPuzzle])

  const retry = useCallback(() => {
    if (puzzle) {
      loadPuzzle(puzzle)
      setStreak(0)
    }
  }, [puzzle, loadPuzzle])

  // ── Move handler ──────────────────────────────────────────────────────────

  const onDrop = useCallback((from, to) => {
    if (!game || !puzzle || status !== 'playing') return false

    const expected = puzzle.moves[moveIdx]
    if (!expected) return false

    // Attempt the move in chess.js (validates legality)
    const copy = new Chess(game.fen())
    const piece = copy.get(from)
    const moveObj = { from, to }

    // Auto-detect pawn promotion
    if (piece?.type === 'p') {
      const rank = parseInt(to[1])
      if ((piece.color === 'w' && rank === 8) || (piece.color === 'b' && rank === 1)) {
        moveObj.promotion = expected.length > 4 ? expected[4] : 'q'
      }
    }

    const result = copy.move(moveObj)
    if (!result) return false // Illegal move in chess

    // Compare with expected UCI move
    const isCorrect =
      from === expected.slice(0, 2) &&
      to   === expected.slice(2, 4) &&
      (!expected[4] || result.promotion === expected[4])

    if (isCorrect) {
      setHighlights({
        [from]: { background: 'rgba(34,197,94,.45)' },
        [to]:   { background: 'rgba(34,197,94,.45)' },
      })

      const hasComputerResponse = moveIdx + 1 < puzzle.moves.length

      if (!hasComputerResponse) {
        // ✓ Puzzle complete
        setGame(copy)
        setStatus('solved')
        setMsg('Solved! 🎉')
        setStreak(s => s + 1)
        setTotalSolved(t => t + 1)
      } else {
        // ✓ Correct but more moves to go – play computer response
        setGame(copy)
        setStatus('thinking')
        setMsg('Correct — keep going!')

        timerRef.current = setTimeout(() => {
          const afterComp = new Chess(copy.fen())
          const compMove = afterComp.move(uciToObj(puzzle.moves[moveIdx + 1]))
          if (compMove) {
            setGame(afterComp)
            setHighlights({
              [compMove.from]: { background: 'rgba(255,170,0,.35)' },
              [compMove.to]:   { background: 'rgba(255,170,0,.35)' },
            })
          }
          setMoveIdx(moveIdx + 2)
          setStatus('playing')
          setMsg('')
        }, 700)
      }
      return true

    } else {
      // ✗ Wrong move
      setStatus('wrong')
      setMsg('Not quite — try again!')
      setHighlights({
        [from]: { background: 'rgba(220,38,38,.45)' },
        [to]:   { background: 'rgba(220,38,38,.45)' },
      })
      timerRef.current = setTimeout(() => {
        setStatus('playing')
        setMsg('')
        setHighlights({})
      }, 1400)
      return false
    }
  }, [game, puzzle, moveIdx, status])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="app-loading">
        Failed to load puzzles: {loadError}
      </div>
    )
  }

  if (!game || !puzzle) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        Loading puzzles…
      </div>
    )
  }

  const hint     = getMateHint(puzzle.themes)
  const isSolved = status === 'solved'
  const isWrong  = status === 'wrong'

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">♟</span>
          <h1>Chess Puzzle Gauntlet</h1>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="stat-icon">🔥</span>
            <span className="stat-val">{streak}</span>
            <span className="stat-lbl">streak</span>
          </div>
          <div className="stat">
            <span className="stat-icon">✅</span>
            <span className="stat-val">{totalSolved}</span>
            <span className="stat-lbl">solved</span>
          </div>
        </div>
      </header>

      {/* ── Puzzle info ── */}
      <div className="puzzle-info">
        <span className="hint-badge">{hint}</span>
        <span className="turn-badge">
          {orientation === 'white' ? '⬜ White' : '⬛ Black'} to move
        </span>
        <span className="rating-badge">★ {puzzle.rating}</span>
      </div>

      {/* ── Board ── */}
      <div className={`board-wrap${isWrong ? ' shake' : ''}${isSolved ? ' glow-green' : ''}`}>
        <Chessboard
          position={game.fen()}
          onPieceDrop={onDrop}
          boardOrientation={orientation}
          arePremovesAllowed={false}
          animationDuration={200}
          customSquareStyles={highlights}
          customBoardStyle={{
            borderRadius: '6px',
            boxShadow: '0 6px 32px rgba(0,0,0,.5)',
          }}
          customDarkSquareStyle={{ backgroundColor: '#4a7c59' }}
          customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
        />
      </div>

      {/* ── Feedback ── */}
      <div className="feedback-area">
        {msg && (
          <p className={`feedback-msg ${isSolved ? 'success' : isWrong ? 'error' : 'info'}`}>
            {msg}
          </p>
        )}

        {isSolved && (
          <button className="btn btn-primary" onClick={goNext}>
            Next Puzzle →
          </button>
        )}

        {isWrong && (
          <button className="btn btn-danger" onClick={retry}>
            ↺ Restart Puzzle
          </button>
        )}

        {!msg && status === 'playing' && (
          <p className="feedback-msg instruction">Drag a piece to make your move</p>
        )}

        {status === 'thinking' && !msg && (
          <p className="feedback-msg instruction">Opponent is responding…</p>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="app-footer">
        Puzzles from{' '}
        <a href="https://lichess.org" target="_blank" rel="noreferrer">
          lichess.org
        </a>{' '}
        (CC0) · Built with React &amp; chess.js
      </footer>
    </div>
  )
}
