/**
 * PuzzleRush — timed puzzle mode.
 *
 * Players have a fixed time limit (3 or 5 minutes) to solve as many puzzles
 * as possible. Three wrong attempts on a single puzzle count as a miss and
 * auto-advance. Score = puzzles fully solved. Displayed as a full-screen
 * overlay launched from the main menu.
 *
 * Props:
 *   allPuzzles    - the full loaded puzzle array (from App's state)
 *   settings      - the app settings object (for board theme, sound, shake)
 *   bestScore     - current stored best score (number)
 *   leaderboard   - array of top-10 run entries { score, durationSeconds, date }
 *   onAddScore    - called with (score, durationSeconds) at end of each run
 *   onClose       - called when the overlay should be dismissed
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getBoardTheme } from './data/boardThemes'
import { getShuffledPuzzles } from './data/puzzles'
import { playCorrect, playWrong, playSolved } from './sounds'

const MIN_BOARD = 160
const DURATION_OPTIONS = [
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
]
// Reusing the same detection logic as the main puzzle board
function getPuzzleObjective(themes = []) {
  for (let n = 1; n <= 5; n++) {
    if (themes.includes(`mateIn${n}`)) return `Mate in ${n}`
  }
  if (themes.includes('mate'))      return 'Deliver Checkmate'
  if (themes.includes('fork'))      return 'Find the Fork'
  if (themes.includes('pin'))       return 'Find the Pin'
  if (themes.includes('skewer'))    return 'Find the Skewer'
  if (themes.includes('sacrifice')) return 'Find the Sacrifice'
  if (themes.includes('endgame'))   return 'Win the Endgame'
  return 'Find the Best Move'
}

const MAX_WRONG = 3

function uciToObj(uci) {
  return {
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci[4] } : {}),
  }
}

// ── Phase machine ─────────────────────────────────────────────────────────────
// 'start'   → lobby screen (pick duration, start button)
// 'playing' → active game
// 'results' → time-up results screen

export default function PuzzleRush({ allPuzzles, settings, bestScore, leaderboard = [], onAddScore, onClose }) {
  const [phase, setPhase]     = useState('start')
  const [duration, setDuration] = useState(180)

  // ── Active game state ────────────────────────────────────────────────────
  const [queue,        setQueue]        = useState([])
  const [qIdx,         setQIdx]         = useState(0)
  const [game,         setGame]         = useState(null)
  const [puzzle,       setPuzzle]       = useState(null)
  const [moveIdx,      setMoveIdx]      = useState(1)
  const [orientation,  setOrientation]  = useState('white')
  const [highlights,   setHighlights]   = useState({})
  const [msg,          setMsg]          = useState('')
  const [msgType,      setMsgType]      = useState('info')  // 'info' | 'success' | 'error'
  const [score,        setScore]        = useState(0)
  const [wrongCount,   setWrongCount]   = useState(0)
  const [timeLeft,     setTimeLeft]     = useState(180)
  const [isShaking,    setIsShaking]    = useState(false)
  const [selectedSq,   setSelectedSq]   = useState(null)
  const [legalTargets, setLegalTargets] = useState([])
  const [boardWidth,   setBoardWidth]   = useState(() =>
    Math.max(MIN_BOARD, Math.floor(Math.min(
      window.innerWidth  - 40,
      window.innerHeight * 0.45,
    )))
  )

  // ── Refs ─────────────────────────────────────────────────────────────────
  const timerRef        = useRef(null)   // countdown interval
  const computerTimerRef = useRef(null)  // computer reply delay
  const advanceTimerRef  = useRef(null)  // auto-advance delay
  const boardWrapRef    = useRef(null)
  const [boardWrapMounted, setBoardWrapMounted] = useState(false)
  const setBoardWrapNode = useCallback((node) => {
    boardWrapRef.current = node
    setBoardWrapMounted(!!node)
  }, [])

  // ── Board sizing ─────────────────────────────────────────────────────────
  useEffect(() => {
    const wrapEl = boardWrapRef.current
    if (!wrapEl) return
    const update = () => {
      const rect = wrapEl.getBoundingClientRect()
      const size = Math.max(MIN_BOARD, Math.floor(Math.min(rect.width, rect.height)))
      setBoardWidth(prev => prev === size ? prev : size)
    }
    update()
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    obs?.observe(wrapEl)
    window.addEventListener('resize', update)
    return () => { obs?.disconnect(); window.removeEventListener('resize', update) }
  }, [boardWrapMounted])

  // ── Load a puzzle ─────────────────────────────────────────────────────────
  const loadPuzzle = useCallback((p) => {
    if (computerTimerRef.current) clearTimeout(computerTimerRef.current)
    if (advanceTimerRef.current)  clearTimeout(advanceTimerRef.current)
    const chess = new Chess(p.fen)
    chess.move(uciToObj(p.moves[0]))
    setGame(new Chess(chess.fen()))
    setPuzzle(p)
    setMoveIdx(1)
    setOrientation(chess.turn() === 'w' ? 'white' : 'black')
    setHighlights({})
    setMsg('')
    setMsgType('info')
    setWrongCount(0)
    setSelectedSq(null)
    setLegalTargets([])
  }, [])

  // ── Start the run ─────────────────────────────────────────────────────────
  const startRun = useCallback(() => {
    const shuffled = getShuffledPuzzles(allPuzzles)
    setQueue(shuffled)
    setQIdx(0)
    setScore(0)
    setTimeLeft(duration)
    setPhase('playing')
    loadPuzzle(shuffled[0])
  }, [allPuzzles, duration, loadPuzzle])

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // ── Time-up transition ────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0) {
      if (computerTimerRef.current) clearTimeout(computerTimerRef.current)
      if (advanceTimerRef.current)  clearTimeout(advanceTimerRef.current)
      setPhase('results')
    }
  }, [timeLeft, phase])

  // ── Record score when results appear ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'results') return
    if (score > 0) onAddScore(score, duration)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Advance to next puzzle ────────────────────────────────────────────────
  const advanceToNext = useCallback((nextQIdx, nextQueue) => {
    const q = nextQueue ?? queue
    const idx = nextQIdx ?? qIdx + 1
    if (idx >= q.length) {
      // Ran out of puzzles (extremely unlikely with 14k+) — reshuffle
      const reshuffled = getShuffledPuzzles(allPuzzles)
      setQueue(reshuffled)
      setQIdx(0)
      loadPuzzle(reshuffled[0])
    } else {
      setQIdx(idx)
      loadPuzzle(q[idx])
    }
  }, [queue, qIdx, allPuzzles, loadPuzzle])

  // ── Move handling ─────────────────────────────────────────────────────────
  const commitMove = useCallback((from, to, promotion) => {
    if (!game || !puzzle || phase !== 'playing') return false

    const expected = puzzle.moves[moveIdx]
    if (!expected) return false

    const isCorrect = (
      from === expected.slice(0, 2) &&
      to   === expected.slice(2, 4) &&
      (!expected[4] || promotion === expected[4])
    )

    if (!isCorrect) {
      const next = wrongCount + 1
      setWrongCount(next)
      if (settings.sound) playWrong()
      if (settings.shake) {
        setIsShaking(true)
        setTimeout(() => setIsShaking(false), 500)
      }

      if (next >= MAX_WRONG) {
        setMsg(`❌ 3 misses — moving on…`)
        setMsgType('error')
        advanceTimerRef.current = setTimeout(() => advanceToNext(), 900)
      } else {
        setMsg(`✗ Wrong (${next}/${MAX_WRONG} misses)`)
        setMsgType('error')
      }
      return false
    }

    // Correct move
    const copy = new Chess(game.fen())
    const result = copy.move({ from, to, promotion })
    if (!result) return false

    if (settings.sound) playCorrect()
    setHighlights({
      [result.from]: { background: 'rgba(34,197,94,.45)' },
      [result.to]:   { background: 'rgba(34,197,94,.45)' },
    })

    const nextMoveIdx = moveIdx + 1

    // Check if puzzle is fully solved (no more player moves)
    const hasComputerReply = !!puzzle.moves[nextMoveIdx]
    const hasAnotherPlayerMove = !!puzzle.moves[nextMoveIdx + 1]

    if (!hasComputerReply) {
      // Fully solved
      if (settings.sound) playSolved()
      setScore(s => s + 1)
      setMsg('✓ Solved!')
      setMsgType('success')
      setGame(copy)
      advanceTimerRef.current = setTimeout(() => advanceToNext(), 700)
      return true
    }

    // Computer plays its reply
    setGame(copy)
    setMoveIdx(nextMoveIdx)
    setMsg('Correct!')
    setMsgType('success')

    const idxAtMove = nextMoveIdx
    computerTimerRef.current = setTimeout(() => {
      const afterComp = new Chess(copy.fen())
      const compMove = afterComp.move(uciToObj(puzzle.moves[idxAtMove]))
      if (compMove) {
        setHighlights({
          [compMove.from]: { background: 'rgba(100,100,255,.35)' },
          [compMove.to]:   { background: 'rgba(100,100,255,.35)' },
        })
        setGame(afterComp)
      }

      if (!hasAnotherPlayerMove) {
        // Solved after computer reply
        if (settings.sound) playSolved()
        setScore(s => s + 1)
        setMsg('✓ Solved!')
        setMsgType('success')
        advanceTimerRef.current = setTimeout(() => advanceToNext(), 700)
      } else {
        setMoveIdx(idxAtMove + 1)
        setMsg('Keep going!')
        setMsgType('info')
      }
    }, 400)

    return true
  }, [game, puzzle, moveIdx, wrongCount, phase, settings, advanceToNext])

  const onDrop = useCallback((from, to, piece) => {
    const promotion = piece?.[1]?.toLowerCase() === 'p' &&
      ((piece[0] === 'w' && to[1] === '8') || (piece[0] === 'b' && to[1] === '1'))
      ? 'q' : undefined
    return commitMove(from, to, promotion)
  }, [commitMove])

  const onSquareClick = useCallback((sq) => {
    if (!game || phase !== 'playing') return
    const piece = game.get(sq)
    const turn  = game.turn()

    if (selectedSq) {
      if (legalTargets.includes(sq)) {
        // Detect promotion
        const movingPiece = game.get(selectedSq)
        const isPromo = movingPiece?.type === 'p' &&
          ((turn === 'w' && sq[1] === '8') || (turn === 'b' && sq[1] === '1'))
        commitMove(selectedSq, sq, isPromo ? 'q' : undefined)
        setSelectedSq(null)
        setLegalTargets([])
        return
      }
      // Click another own piece → re-select
      if (piece && piece.color === turn) {
        setSelectedSq(sq)
        setLegalTargets(game.moves({ square: sq, verbose: true }).map(m => m.to))
        return
      }
      setSelectedSq(null)
      setLegalTargets([])
      return
    }

    if (piece && piece.color === turn) {
      setSelectedSq(sq)
      setLegalTargets(game.moves({ square: sq, verbose: true }).map(m => m.to))
    }
  }, [game, phase, selectedSq, legalTargets, commitMove])

  // ── Square styles (highlights + click-to-move) ────────────────────────────
  const customSquareStyles = useMemo(() => {
    const styles = { ...highlights }
    if (selectedSq) {
      styles[selectedSq] = { background: 'rgba(100,180,255,0.7)' }
    }
    legalTargets.forEach(sq => {
      if (!styles[sq]) {
        styles[sq] = { background: 'radial-gradient(circle, rgba(0,0,0,0.2) 36%, transparent 40%)' }
      }
    })
    return styles
  }, [highlights, selectedSq, legalTargets])

  // ── Theme ─────────────────────────────────────────────────────────────────
  const theme = useMemo(() => getBoardTheme(settings.boardTheme), [settings.boardTheme])

  // ── Timer display ─────────────────────────────────────────────────────────
  const mins = Math.floor(timeLeft / 60)
  const secs = String(timeLeft % 60).padStart(2, '0')
  const isLow = timeLeft <= 30 && phase === 'playing'

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      clearTimeout(computerTimerRef.current)
      clearTimeout(advanceTimerRef.current)
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="rush-overlay">

      {/* ── Start screen ── */}
      {phase === 'start' && (
        <div className="rush-screen rush-start">
          <button className="rush-close-btn" onClick={onClose} aria-label="Close">✕</button>
          <div className="rush-icon">⚡</div>
          <h2 className="rush-title">Puzzle Rush</h2>
          <p className="rush-subtitle">
            Solve as many puzzles as you can before time runs out.<br />
            3 wrong moves on one puzzle = skip.
          </p>
          {bestScore > 0 && (
            <div className="rush-best">Best: {bestScore} puzzles</div>
          )}
          <div className="rush-duration-row">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.seconds}
                className={`rush-duration-btn${duration === opt.seconds ? ' selected' : ''}`}
                onClick={() => setDuration(opt.seconds)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button className="btn btn-primary rush-start-btn" onClick={startRun}>
            Start ⚡
          </button>
        </div>
      )}

      {/* ── Playing screen ── */}
      {phase === 'playing' && game && puzzle && (
        <div className="rush-screen rush-playing">
          {/* Objective + turn labels */}
          <div className="rush-meta-bar">
            <span className="rush-objective">{getPuzzleObjective(puzzle.themes)}</span>
            <span className="rush-turn-label">
              {orientation === 'white' ? '⬜ Your Turn: White' : '⬛ Your Turn: Black'}
            </span>
          </div>

          <div className="rush-hud">
            <div className={`rush-timer${isLow ? ' low' : ''}`}>
              {mins}:{secs}
            </div>
            <div className="rush-score-display">
              ⚡ {score}
            </div>
            <button className="rush-give-up" onClick={() => {
              clearInterval(timerRef.current)
              clearTimeout(computerTimerRef.current)
              clearTimeout(advanceTimerRef.current)
              setPhase('results')
            }}>
              Give up
            </button>
          </div>

          <div
            ref={setBoardWrapNode}
            className={`board-wrap${isShaking && settings.shake ? ' shake' : ''}`}
            style={{ width: boardWidth }}
          >
            <Chessboard
              position={game.fen()}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              boardOrientation={orientation}
              boardWidth={boardWidth}
              arePremovesAllowed={false}
              animationDuration={150}
              customSquareStyles={customSquareStyles}
              customBoardStyle={{ borderRadius: '6px', boxShadow: '0 6px 32px rgba(0,0,0,.5)' }}
              customDarkSquareStyle={{ backgroundColor: theme.dark }}
              customLightSquareStyle={{ backgroundColor: theme.light }}
              isDraggablePiece={({ piece }) => {
                const pieceColor = piece[0] === 'w' ? 'w' : 'b'
                return pieceColor === game.turn()
              }}
            />
          </div>

          <div className="rush-feedback" style={{ width: boardWidth }}>
            {msg && (
              <p className={`feedback-msg ${msgType === 'success' ? 'success' : msgType === 'error' ? 'error' : 'info'}`}>
                {msg}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Results screen ── */}
      {phase === 'results' && (
        <div className="rush-screen rush-results">
          <button className="rush-close-btn" onClick={onClose} aria-label="Close">✕</button>
          <div className="rush-icon">⚡</div>
          <h2 className="rush-title">Time's up!</h2>

          <div className="rush-result-score">{score}</div>
          <div className="rush-result-label">puzzles solved</div>

          {score > 0 && score >= bestScore && (
            <div className="rush-new-best">🎉 New best!</div>
          )}
          {bestScore > 0 && score < bestScore && (
            <div className="rush-prev-best">Best: {bestScore}</div>
          )}

          {leaderboard.length > 0 && (
            <div className="rush-leaderboard">
              <div className="rush-lb-title">Top Runs</div>
              {leaderboard.map((entry, i) => (
                <div className="rush-lb-row" key={i}>
                  <span className="rush-lb-rank">{i + 1}</span>
                  <span className="rush-lb-score">{entry.score}</span>
                  <span className="rush-lb-meta">
                    {Math.floor(entry.durationSeconds / 60)}min · {entry.date}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="rush-result-actions">
            <button className="btn btn-primary" onClick={startRun}>
              Play Again ⚡
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Back to Puzzles
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
