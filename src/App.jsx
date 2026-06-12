import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import confetti from 'canvas-confetti'
import { loadPuzzles, getShuffledPuzzles, filterPuzzles } from './data/puzzles'
import { boardThemes, getBoardTheme } from './data/boardThemes'
import { puzzleThemeOptions } from './data/puzzleThemes'
import { useSettings } from './useSettings'
import { useStats } from './useStats'
import { playCorrect, playWrong, playSolved } from './sounds'
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
  const [allPuzzles, setAllPuzzles] = useState(null)
  const [queue,       setQueue]       = useState([])
  const [qIdx,        setQIdx]        = useState(0)
  const [game,        setGame]        = useState(null)
  const [puzzle,      setPuzzle]      = useState(null)
  const [moveIdx,     setMoveIdx]     = useState(1)
  const [status,      setStatus]      = useState('idle')
  // status: 'idle' | 'playing' | 'thinking' | 'wrong' | 'solved'
  const [msg,         setMsg]         = useState('')
  const [highlights,  setHighlights]  = useState({})
  const { streak, totalSolved, setStreak, setTotalSolved, resetStats } = useStats()
  const [orientation, setOrientation] = useState('white')
  const [loadError,   setLoadError]   = useState(null)
  const [noMatch,     setNoMatch]     = useState(false)
  const [settings,    updateSettings] = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hintLevel,   setHintLevel]   = useState(0)
  const [history,     setHistory]     = useState([])
  const [wrongFen,    setWrongFen]    = useState(null)
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalTargets,   setLegalTargets]   = useState([])
  const [boardWidth,  setBoardWidth]  = useState(480)
  const timerRef = useRef(null)
  const goNextRef = useRef(null)
  const retryRef = useRef(null)
  const hintRef = useRef(null)
  const undoRef = useRef(null)
  const hintUsedRef = useRef(false)
  const boardWrapRef = useRef(null)

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
    setHintLevel(0)
    setHistory([])
    setWrongFen(null)
    setSelectedSquare(null)
    setLegalTargets([])
    hintUsedRef.current = false
  }, [])

  // Load the full puzzle set once on mount
  useEffect(() => {
    let cancelled = false
    loadPuzzles()
      .then((all) => {
        if (!cancelled) setAllPuzzles(all)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Rebuild the queue whenever the puzzle set or filters change
  useEffect(() => {
    if (!allPuzzles) return
    const filtered = filterPuzzles(allPuzzles, {
      minRating: settings.ratingMin,
      maxRating: settings.ratingMax,
      themes: settings.themes,
    })
    if (filtered.length === 0) {
      setQueue([])
      setPuzzle(null)
      setGame(null)
      setNoMatch(true)
      return
    }
    setNoMatch(false)
    const shuffled = getShuffledPuzzles(filtered)
    setQueue(shuffled)
    setQIdx(0)
    loadPuzzle(shuffled[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPuzzles, settings.ratingMin, settings.ratingMax, settings.themes.join(','), loadPuzzle])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setSettingsOpen(false)
        return
      }
      // Avoid hijacking keys while typing in a form control
      if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
        return
      }
      if (status === 'solved' && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) {
        e.preventDefault()
        goNextRef.current?.()
      } else if (status === 'wrong' && (e.key === 'r' || e.key === 'R' || e.key === 'Enter')) {
        e.preventDefault()
        retryRef.current?.()
      } else if ((e.key === 'h' || e.key === 'H') && (status === 'playing' || status === 'wrong')) {
        e.preventDefault()
        hintRef.current?.()
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault()
        undoRef.current?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [status])

  // ── Board sizing ──────────────────────────────────────────────────────────
  // Track the rendered size of the board wrapper so react-chessboard always
  // gets an explicit pixel width. This keeps square-hit-detection accurate
  // across phones, tablets, desktops, and orientation changes.
  useEffect(() => {
    const el = boardWrapRef.current
    if (!el) return

    const updateWidth = () => {
      const { width, height } = el.getBoundingClientRect()
      const size = Math.floor(Math.min(width, height) || width)
      if (size > 0) setBoardWidth(size)
    }

    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth)
      observer.observe(el)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

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

  // ── Commit a correct move (player drag or hint reveal) ────────────────────

  const commitCorrectMove = useCallback((copy, result, { viaHint = false } = {}) => {
    setHighlights({
      [result.from]: { background: 'rgba(34,197,94,.45)' },
      [result.to]:   { background: 'rgba(34,197,94,.45)' },
    })

    const hasComputerResponse = moveIdx + 1 < puzzle.moves.length

    if (!hasComputerResponse) {
      // ✓ Puzzle complete
      setGame(copy)
      setStatus('solved')
      const usedHint = hintUsedRef.current || viaHint
      setMsg(usedHint ? 'Solved (hint used)' : 'Solved! 🎉')
      setTotalSolved(t => t + 1)
      if (usedHint) {
        setStreak(0)
      } else {
        setStreak(s => s + 1)
      }
      if (settings.sound) playSolved()
      if (!usedHint) {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.6 },
        })
      }
    } else {
      // ✓ Correct but more moves to go – play computer response
      setGame(copy)
      setStatus('thinking')
      setMsg('Correct — keep going!')
      if (settings.sound) playCorrect()

      const idxAtMove = moveIdx
      timerRef.current = setTimeout(() => {
        const afterComp = new Chess(copy.fen())
        const compMove = afterComp.move(uciToObj(puzzle.moves[idxAtMove + 1]))
        if (compMove) {
          setGame(afterComp)
          setHighlights({
            [compMove.from]: { background: 'rgba(255,170,0,.35)' },
            [compMove.to]:   { background: 'rgba(255,170,0,.35)' },
          })
        }
        setMoveIdx(idxAtMove + 2)
        setStatus('playing')
        setMsg('')
        setHintLevel(0)
      }, 700)
    }
  }, [moveIdx, puzzle, settings.sound])

  // ── Move handler ──────────────────────────────────────────────────────────
  // Shared by both input methods: drag-and-drop (onDrop) and click/tap-to-move
  // (onSquareClick). Returns true if a move (correct or incorrect-but-legal)
  // was made, false if the move was illegal or couldn't be attempted.

  const attemptMove = useCallback((from, to) => {
    if (!game || !puzzle || (status !== 'playing' && status !== 'wrong')) return false

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
      setHistory(h => {
        const base = h.length && h[h.length - 1].wasWrong ? h.slice(0, -1) : h
        return [...base, { fen: game.fen(), moveIdx }]
      })
      setWrongFen(null)
      commitCorrectMove(copy, result)
      return true

    } else {
      // ✗ Wrong move — show the attempted move on the board (it stays where
      // it was dropped) along with red highlights and the message, until the
      // player chooses what to do next: use a hint, undo, or restart. Nothing
      // auto-clears or auto-resets.
      setStatus('wrong')
      setMsg('Not quite — try again!')
      setWrongFen(copy.fen())
      setHighlights({
        [from]: { background: 'rgba(220,38,38,.45)' },
        [to]:   { background: 'rgba(220,38,38,.45)' },
      })
      if (settings.sound) playWrong()
      setHistory(h => (h.length && h[h.length - 1].wasWrong ? h : [...h, { fen: game.fen(), moveIdx, wasWrong: true }]))
      return true
    }
  }, [game, puzzle, moveIdx, status, settings.sound, commitCorrectMove])

  // Drag-and-drop entry point.
  const onDrop = useCallback((from, to) => {
    const moved = attemptMove(from, to)
    setSelectedSquare(null)
    setLegalTargets([])
    return moved
  }, [attemptMove])

  // Click/tap-to-move entry point. Works alongside drag-and-drop at all times.
  const onSquareClick = useCallback((square) => {
    if (!game || !puzzle || (status !== 'playing' && status !== 'wrong')) return

    // A piece is already selected — try to move it to the clicked square.
    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null)
        setLegalTargets([])
        return
      }
      if (legalTargets.includes(square)) {
        attemptMove(selectedSquare, square)
        setSelectedSquare(null)
        setLegalTargets([])
        return
      }
      // Clicking a different piece of the side to move re-selects it instead
      // of just clearing the selection.
      const piece = game.get(square)
      if (piece && piece.color === game.turn()) {
        const moves = game.moves({ square, verbose: true })
        if (moves.length) {
          setSelectedSquare(square)
          setLegalTargets(moves.map(m => m.to))
          return
        }
      }
      setSelectedSquare(null)
      setLegalTargets([])
      return
    }

    // No selection yet — select the clicked square if it holds a piece that
    // belongs to the side to move and has at least one legal move.
    const piece = game.get(square)
    if (!piece || piece.color !== game.turn()) return
    const moves = game.moves({ square, verbose: true })
    if (!moves.length) return
    setSelectedSquare(square)
    setLegalTargets(moves.map(m => m.to))
  }, [game, puzzle, status, selectedSquare, legalTargets, attemptMove])

  // Merge gameplay highlights (correct/wrong/hint flashes) with the
  // click-to-move selection/legal-target highlights into one style object.
  const squareStyles = useMemo(() => {
    const styles = { ...highlights }
    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] || {}),
        background: 'rgba(96,165,250,.45)',
      }
    }
    for (const sq of legalTargets) {
      styles[sq] = {
        ...(styles[sq] || {}),
        background: styles[sq]?.background
          ? styles[sq].background
          : 'radial-gradient(circle, rgba(96,165,250,.55) 22%, transparent 26%)',
      }
    }
    return styles
  }, [highlights, selectedSquare, legalTargets])

  // ── Hint ───────────────────────────────────────────────────────────────────

  const handleHint = useCallback(() => {
    if (!game || !puzzle || (status !== 'playing' && status !== 'wrong')) return
    const expected = puzzle.moves[moveIdx]
    if (!expected) return
    const from = expected.slice(0, 2)
    const to = expected.slice(2, 4)

    // A hint changes the highlighted squares, so clear any click-to-move
    // selection to avoid stale highlights/targets.
    setSelectedSquare(null)
    setLegalTargets([])

    // Using a hint clears any "wrong move" feedback (and reverts the board
    // back to the real position) so the player can focus on the highlighted
    // squares.
    if (status === 'wrong') {
      setStatus('playing')
      setMsg('')
      setWrongFen(null)
      setHistory(h => (h.length && h[h.length - 1].wasWrong ? h.slice(0, -1) : h))
    }

    if (hintLevel === 0) {
      setHighlights({ [from]: { background: 'rgba(245,158,11,.55)' } })
      setHintLevel(1)
    } else if (hintLevel === 1) {
      setHighlights({
        [from]: { background: 'rgba(245,158,11,.55)' },
        [to]:   { background: 'rgba(245,158,11,.55)' },
      })
      setHintLevel(2)
    } else {
      // Reveal: play the correct move for the player
      const copy = new Chess(game.fen())
      const result = copy.move(uciToObj(expected))
      if (!result) return
      hintUsedRef.current = true
      setHistory(h => [...h, { fen: game.fen(), moveIdx }])
      commitCorrectMove(copy, result, { viaHint: true })
    }
  }, [game, puzzle, moveIdx, status, hintLevel, commitCorrectMove])

  // ── Undo ───────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (history.length === 0 || status === 'thinking') return
    const last = history[history.length - 1]
    if (timerRef.current) clearTimeout(timerRef.current)
    if (status === 'solved') {
      setTotalSolved(t => Math.max(0, t - 1))
      if (!hintUsedRef.current) setStreak(s => Math.max(0, s - 1))
    }
    setHistory(h => h.slice(0, -1))
    setGame(new Chess(last.fen))
    setMoveIdx(last.moveIdx)
    setStatus('playing')
    setMsg('')
    setHighlights({})
    setHintLevel(0)
    setWrongFen(null)
    setSelectedSquare(null)
    setLegalTargets([])
    hintUsedRef.current = false
  }, [history, status])

  // ── Reset stats ───────────────────────────────────────────────────────────

  const handleResetStats = useCallback(() => {
    if (window.confirm('Reset your streak and total solved count? This cannot be undone.')) {
      resetStats()
    }
  }, [resetStats])

  goNextRef.current = goNext
  retryRef.current = retry
  hintRef.current = handleHint
  undoRef.current = handleUndo

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="app-loading">
        Failed to load puzzles: {loadError}
      </div>
    )
  }

  if (noMatch) {
    return (
      <div className="app-loading">
        <p>No puzzles match your filters.</p>
        <button
          className="btn btn-primary"
          onClick={() => updateSettings({ ratingMin: 1000, ratingMax: 2000, themes: [] })}
        >
          Reset filters
        </button>
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
  const theme    = getBoardTheme(settings.boardTheme)
  const canUndo  = history.length > 0 && status !== 'thinking'
  const canHint  = status === 'playing' || status === 'wrong'

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
          <button
            className="settings-btn"
            aria-label="Settings"
            onClick={() => setSettingsOpen(o => !o)}
          >
            ⚙
          </button>
        </div>
      </header>

      {/* ── Settings panel ── */}
      {settingsOpen && (
        <div className="settings-panel">
          <div className="settings-panel-header">
            <h2>Settings</h2>
            <button
              className="settings-close-btn"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              ✕
            </button>
          </div>
          <label className="settings-row">
            <span>Wrong-move shake animation</span>
            <input
              type="checkbox"
              checked={settings.shake}
              onChange={(e) => updateSettings({ shake: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>Sound effects</span>
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => updateSettings({ sound: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>Board theme</span>
            <select
              value={settings.boardTheme}
              onChange={(e) => updateSettings({ boardTheme: e.target.value })}
            >
              {boardThemes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <div className="settings-section">
            <div className="settings-section-title">
              Difficulty: {settings.ratingMin}–{settings.ratingMax}
            </div>
            <div className="rating-range">
              <input
                type="range"
                min="500"
                max="2000"
                step="50"
                value={settings.ratingMin}
                onChange={(e) => {
                  const v = Math.min(Number(e.target.value), settings.ratingMax)
                  updateSettings({ ratingMin: v })
                }}
              />
              <input
                type="range"
                min="500"
                max="2000"
                step="50"
                value={settings.ratingMax}
                onChange={(e) => {
                  const v = Math.max(Number(e.target.value), settings.ratingMin)
                  updateSettings({ ratingMax: v })
                }}
              />
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">
              Puzzle themes
              {settings.themes.length > 0 && (
                <button className="link-btn" onClick={() => updateSettings({ themes: [] })}>
                  Reset
                </button>
              )}
            </div>
            <div className="theme-grid">
              {puzzleThemeOptions.map(opt => (
                <label key={opt.id} className="theme-chip">
                  <input
                    type="checkbox"
                    checked={settings.themes.includes(opt.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...settings.themes, opt.id]
                        : settings.themes.filter(t => t !== opt.id)
                      updateSettings({ themes: next })
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="settings-hint">No themes selected = all themes</p>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">Stats</div>
            <button className="btn btn-danger" onClick={handleResetStats}>
              Reset Stats
            </button>
          </div>

          <p className="settings-hint">
            Shortcuts: Enter/→ next · R retry · H hint · U undo · Esc close
          </p>
        </div>
      )}

      {/* ── Puzzle info ── */}
      <div className="puzzle-info">
        <span className="hint-badge">{hint}</span>
        <span className="turn-badge">
          {orientation === 'white' ? '⬜ White' : '⬛ Black'} to move
        </span>
        <span className="rating-badge">★ {puzzle.rating}</span>
      </div>

      {/* ── Board ── */}
      <div
        ref={boardWrapRef}
        className={`board-wrap${isWrong && settings.shake ? ' shake' : ''}${isSolved ? ' glow-green' : ''}`}
      >
        <Chessboard
          position={status === 'wrong' && wrongFen ? wrongFen : game.fen()}
          onPieceDrop={onDrop}
          onSquareClick={onSquareClick}
          boardOrientation={orientation}
          boardWidth={boardWidth}
          arePremovesAllowed={false}
          animationDuration={200}
          customSquareStyles={squareStyles}
          customBoardStyle={{
            borderRadius: '6px',
            boxShadow: '0 6px 32px rgba(0,0,0,.5)',
          }}
          customDarkSquareStyle={{ backgroundColor: theme.dark }}
          customLightSquareStyle={{ backgroundColor: theme.light }}
        />
      </div>

      {/* ── Controls (mobile-friendly buttons mirroring shortcuts) ── */}
      <div className="control-row">
        <button className="btn btn-secondary" onClick={handleUndo} disabled={!canUndo}>
          ↺ Undo
        </button>
        <button className="btn btn-secondary" onClick={handleHint} disabled={!canHint}>
          {hintLevel < 2 ? '💡 Hint' : '💡 Show Move'}
        </button>
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
