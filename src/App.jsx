import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { fireConfettiFromElement } from './confetti'
import { loadPuzzles, getShuffledPuzzles, filterPuzzles, getDailyPuzzle } from './data/puzzles'
import { boardThemes, getBoardTheme } from './data/boardThemes'
import { puzzleThemeOptions } from './data/puzzleThemes'
import { useSettings } from './useSettings'
import { useStats, RATING_BANDS } from './useStats'
import { achievements } from './data/achievements'
import { playCorrect, playWrong, playSolved, playAchievement } from './sounds'
import { buildExplainSteps } from './data/explanations'
import PuzzleRush from './PuzzleRush'
import MultiplayerDuel from './MultiplayerDuel'
import LiveChess from './LiveChess'
import ComputerChess from './ComputerChess'
import GameReview from './GameReview'
import { useAuth } from './useAuth'
import { supabase as supabaseClient } from './supabaseClient'
import './App.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

// Never let the board shrink below this — keeps it playable (and keeps
// boardWidth from ever being set to 0/negative) even if the viewport is too
// cramped for everything to fit without any clipping.
const MIN_BOARD = 160

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
  const {
    streak, totalSolved, accuracy, solvedByRating, solvedByTheme, dailyCompleted,
    unlockedAchievements, newlyUnlocked, clearNewlyUnlocked,
    setStreak, setTotalSolved, recordMove, recordSolve, markDailyCompleted, resetStats,
    rushBestScore, rushLeaderboard, addRushScore,
  } = useStats()
  const [orientation, setOrientation] = useState('white')
  const [loadError,   setLoadError]   = useState(null)
  const [noMatch,     setNoMatch]     = useState(false)
  const [settings,    updateSettings] = useSettings()
  const { user, isAnonymous, authError, googleAlreadyLinked, signInAnonymously, signInWithGoogle, linkGoogle } = useAuth()
  const [hintLevel,   setHintLevel]   = useState(0)
  const [history,     setHistory]     = useState([])
  const [wrongFen,    setWrongFen]    = useState(null)
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalTargets,   setLegalTargets]   = useState([])
  const [boardWidth,  setBoardWidth]  = useState(() =>
    Math.max(MIN_BOARD, Math.floor(Math.min(
      window.innerWidth  - 40,   // viewport width minus rough padding
      window.innerHeight * 0.45, // ~45% of height (leaves room for UI chrome)
    )))
  )
  const [dailyInfo,   setDailyInfo]   = useState(null) // { puzzle, dateStr }
  const [isDaily,     setIsDaily]     = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)
  // Full-screen menu overlay. `activePanel` is null while the top-level menu
  // list is showing, or 'stats' | 'achievements' | 'settings' once one of
  // those is opened from the list.
  const [menuOpen, setMenuOpen] = useState(false)
  const [activePanel, setActivePanel] = useState(null)
  const [rushOpen, setRushOpen] = useState(false)
  const [duelOpen,      setDuelOpen]      = useState(false)
  const [chessOpen,     setChessOpen]     = useState(false)
  const [computerOpen,  setComputerOpen]  = useState(false)
  const [reviewOpen,    setReviewOpen]    = useState(false)
  const [reviewPgn,     setReviewPgn]     = useState('')
  const [reviewColor,   setReviewColor]   = useState('w')
  // URL params: ?room=CODE opens the puzzle duel, ?chess=CODE opens a live chess game
  const [initialRoom]  = useState(() => new URLSearchParams(window.location.search).get('room'))
  const [initialChess] = useState(() => new URLSearchParams(window.location.search).get('chess'))
  // Post-solve "Explain" replay: shows the puzzle's full move sequence on the board.
  const [replaying,   setReplaying]   = useState(false)
  // Consecutive wrong attempts on the current puzzle (three-strike rule).
  const [wrongAttempts, setWrongAttempts] = useState(0)
  // Step-through explain modal: array of { fen, san, label, why, isPlayer }
  // built once when Explain is pressed, shown after the replay finishes.
  const [explainSteps,    setExplainSteps]    = useState([])
  const [explainModal,    setExplainModal]    = useState(false)
  const [explainStepIdx,  setExplainStepIdx]  = useState(0)
  const computerTimerRef  = useRef(null)  // delay before computer plays its reply move
  const autoSolveTimerRef = useRef(null)  // three-strike auto-solve delay
  const replayTimerRef    = useRef(null)  // replay / explain step-through delay
  const explainTimerRef   = useRef(null)
  const goNextRef = useRef(null)
  const retryRef = useRef(null)
  const hintRef = useRef(null)
  const undoRef = useRef(null)
  const autoSolveRef = useRef(null)
  const hintUsedRef = useRef(false)
  const boardWrapRef = useRef(null)
  const toastRef = useRef(null)
  const appRef = useRef(null)

  // Auto-open duel overlay when the page was opened via a ?room= share link
  useEffect(() => {
    if (initialRoom)  setDuelOpen(true)
    if (initialChess) setChessOpen(true)
  }, [initialRoom, initialChess])

  // `.board-wrap` doesn't exist in the DOM during the initial "Loading
  // puzzles…" render (see the `if (!game || !puzzle)` early return below) —
  // at that point `boardWrapRef.current` is null. A plain `useEffect(..., [])`
  // would run once during that loading render, see `wrapEl === null`, bail
  // out immediately, and never run again — so the board-sizing effect (and
  // its ResizeObserver) would never actually attach once the real board
  // mounts, leaving `boardWidth` stuck at its initial value forever. This
  // callback ref + state flag lets the sizing effect re-run the moment
  // `.board-wrap` actually mounts.
  const [boardWrapMounted, setBoardWrapMounted] = useState(false)
  const setBoardWrapNode = useCallback((node) => {
    boardWrapRef.current = node
    setBoardWrapMounted(!!node)
  }, [])

  // ── Load a puzzle ──────────────────────────────────────────────────────────

  const loadPuzzle = useCallback((p) => {
    if (computerTimerRef.current)  clearTimeout(computerTimerRef.current)
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)
    if (replayTimerRef.current)    clearTimeout(replayTimerRef.current)
    if (explainTimerRef.current)   clearTimeout(explainTimerRef.current)
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
    setReplaying(false)
    setWrongAttempts(0)
    setExplainModal(false)
    setExplainSteps([])
    setExplainStepIdx(0)
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
      if (computerTimerRef.current)  clearTimeout(computerTimerRef.current)
      if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)
      if (replayTimerRef.current)    clearTimeout(replayTimerRef.current)
      if (explainTimerRef.current)   clearTimeout(explainTimerRef.current)
    }
  }, [])

  // Pick today's deterministic "puzzle of the day" once the full set is
  // loaded. Same puzzle for everyone on a given calendar date.
  useEffect(() => {
    if (!allPuzzles) return
    setDailyInfo(getDailyPuzzle(allPuzzles))
  }, [allPuzzles])

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
    setIsDaily(false)
    loadPuzzle(shuffled[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPuzzles, settings.ratingMin, settings.ratingMax, settings.themes.join(','), loadPuzzle])

  // ── Adaptive difficulty ───────────────────────────────────────────────────
  // When enabled, tracks a running "offset" based on overall move accuracy
  // after each solved puzzle (+50 on strong accuracy, -50 after a rough
  // patch, clamped to ±250). goNext() uses this offset to prefer puzzles
  // toward the harder/easier end of the user's selected rating range.
  // Stored in a ref (not state) so it never triggers the queue-rebuild
  // effect or disrupts the just-solved puzzle's UI.
  const adaptiveOffsetRef = useRef(0)
  const prevTotalSolvedRef = useRef(totalSolved)
  useEffect(() => {
    if (totalSolved === prevTotalSolvedRef.current) return
    prevTotalSolvedRef.current = totalSolved
    if (!settings.adaptiveDifficulty || accuracy == null) return

    const nudge = accuracy >= 85 ? 50 : accuracy <= 55 ? -50 : 0
    if (nudge === 0) return

    adaptiveOffsetRef.current = Math.max(-250, Math.min(250, adaptiveOffsetRef.current + nudge))
  }, [totalSolved, accuracy, settings.adaptiveDifficulty])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (activePanel) {
          setActivePanel(null)
        } else {
          setMenuOpen(false)
        }
        return
      }
      // While the full-screen menu is open, don't let game shortcuts fire.
      if (menuOpen) return
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
  }, [status, menuOpen, activePanel])

  // ── Board sizing ──────────────────────────────────────────────────────────
  // Track the available space for the board so react-chessboard always gets
  // an explicit pixel width. `.board-wrap` is a flex item with
  // `flex: 1 1 0; min-height: 0; min-height: 160px` (the second, larger
  // `min-height` wins) — flexbox computes its box size purely from the
  // surrounding layout (remaining space after header/puzzle-info/controls/
  // feedback/footer), and `min-height:0` + `overflow:hidden` mean that box
  // size does NOT grow to fit the Chessboard child no matter how big
  // `boardWidth` is. In other words `.board-wrap`'s own
  // `getBoundingClientRect()` is the ground truth for how much space the
  // board actually has — it's correct by construction and doesn't need to be
  // reconstructed by subtracting siblings' heights from `.app`.
  //
  // A previous version tried that subtraction approach (`.app`'s height minus
  // every other child's natural height and the gaps). It was fragile: any
  // height that changes *after* the effect first runs (a badge wrapping to a
  // second line once puzzle data loads, late font reflow, safe-area insets)
  // makes the estimate too generous, so `boardWidth` ends up larger than
  // `.board-wrap`'s real box. The Chessboard then overflows `.board-wrap` and
  // `overflow: hidden` clips it — centered, so evenly off the top AND bottom
  // (the "ranks 1 and 8 chopped off" bug). And checking `.app` for overflow
  // doesn't catch this either: `.board-wrap`'s box doesn't grow to match the
  // oversized board, so `.app` never overflows even though the board is
  // visibly clipped *inside* `.board-wrap`.
  //
  // The even-older version (before that) measured `.board-wrap`'s rect
  // directly like this, but had a `size > 0` guard that *skipped* the update
  // when the rect briefly collapsed to 0 (e.g. before first layout), leaving
  // `boardWidth` stuck at a stale, often-too-large value — the root cause of
  // the "ghost buttons behind the board" bug. This version fixes that by (a)
  // always calling `setBoardWidth` — clamping to `MIN_BOARD` instead of
  // skipping when the rect is 0 — and (b) giving `.board-wrap` a CSS
  // `min-height: ${MIN_BOARD}px` floor so its rect can never actually BE 0,
  // and a ResizeObserver on `.board-wrap` itself re-fires whenever its box
  // size changes for any reason (window resize, sibling height changes,
  // font reflow, etc.), so the measurement is always re-validated against
  // reality.
  useLayoutEffect(() => {
    const wrapEl = boardWrapRef.current
    if (!wrapEl) return

    const updateSize = () => {
      const rect = wrapEl.getBoundingClientRect()
      const size = Math.floor(Math.min(rect.width, rect.height))
      setBoardWidth((prev) => {
        const next = Math.max(MIN_BOARD, size)
        return prev === next ? prev : next
      })
    }

    updateSize()

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null
    observer?.observe(wrapEl)

    // `resize`/`orientationchange` cover desktop window resizing and mobile
    // rotation. `visualViewport.resize` additionally catches cases (common in
    // installed/standalone PWAs) where the on-screen keyboard, browser
    // chrome, or PWA title bar changes the visible viewport without firing a
    // plain `window.resize`. `document.fonts.ready` catches the late reflow
    // once the web font swaps in.
    window.addEventListener('resize', updateSize)
    window.addEventListener('orientationchange', updateSize)
    window.visualViewport?.addEventListener('resize', updateSize)
    document.fonts?.ready?.then(updateSize).catch(() => {})

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateSize)
      window.removeEventListener('orientationchange', updateSize)
      window.visualViewport?.removeEventListener('resize', updateSize)
    }
  }, [boardWrapMounted])

  // When the explain modal is open and the user navigates steps, sync the
  // board position and highlights to the current step.
  useEffect(() => {
    if (!explainModal || !explainSteps[explainStepIdx]) return
    const s = explainSteps[explainStepIdx]
    setGame(new Chess(s.fen))
    setHighlights({})
  }, [explainModal, explainStepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Achievement toasts ────────────────────────────────────────────────────
  // Show newly-unlocked achievements one at a time, auto-dismissing each
  // after a few seconds.
  useEffect(() => {
    if (newlyUnlocked.length === 0) return
    if (settings.sound) playAchievement()
    // Defer to the next frame so the toast has rendered and toastRef has a
    // real bounding rect to center the confetti on.
    requestAnimationFrame(() => {
      fireConfettiFromElement(toastRef, {
        particleCount: 60,
        spread: 60,
        startVelocity: 35,
      })
    })
    const timer = setTimeout(() => clearNewlyUnlocked(), 4000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newlyUnlocked])

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (!queue.length) return
    let next = (qIdx + 1) % queue.length

    // Adaptive difficulty: if a performance-based offset has built up,
    // prefer the nearest queued puzzle (searching forward, wrapping
    // around) to a target rating shifted toward the harder/easier end of
    // the selected range, instead of always taking the very next one.
    if (settings.adaptiveDifficulty && adaptiveOffsetRef.current !== 0 && queue.length > 1) {
      const mid = (settings.ratingMin + settings.ratingMax) / 2
      const target = Math.min(
        settings.ratingMax,
        Math.max(settings.ratingMin, mid + adaptiveOffsetRef.current)
      )
      let bestIdx = next
      let bestDiff = Infinity
      for (let i = 0; i < queue.length; i++) {
        const idx = (next + i) % queue.length
        const diff = Math.abs(queue[idx].rating - target)
        if (diff < bestDiff) {
          bestDiff = diff
          bestIdx = idx
          if (diff < 25) break
        }
      }
      next = bestIdx
    }

    setQIdx(next)
    loadPuzzle(queue[next])
  }, [queue, qIdx, loadPuzzle, settings.adaptiveDifficulty, settings.ratingMin, settings.ratingMax])

  const retry = useCallback(() => {
    if (puzzle) {
      loadPuzzle(puzzle)
      setStreak(0)
    }
  }, [puzzle, loadPuzzle])

  // Toggle between today's daily puzzle and the regular shuffled queue.
  // Leaving daily mode returns to whatever queue puzzle was active before.
  const toggleDaily = useCallback(() => {
    if (isDaily) {
      setIsDaily(false)
      if (queue[qIdx]) loadPuzzle(queue[qIdx])
    } else if (dailyInfo) {
      setIsDaily(true)
      loadPuzzle(dailyInfo.puzzle)
    }
  }, [isDaily, dailyInfo, queue, qIdx, loadPuzzle])

  // ── Commit a correct move (player drag or hint reveal) ────────────────────

  const commitCorrectMove = useCallback((copy, result, { viaHint = false } = {}) => {
    setHighlights({
      [result.from]: { background: 'rgba(34,197,94,.45)' },
      [result.to]:   { background: 'rgba(34,197,94,.45)' },
    })
    setWrongAttempts(0)

    const hasComputerResponse = moveIdx + 1 < puzzle.moves.length

    if (!hasComputerResponse) {
      // ✓ Puzzle complete
      setGame(copy)
      setStatus('solved')
      const usedHint = hintUsedRef.current || viaHint
      setMsg(usedHint ? 'Solved (hint used)' : 'Solved! 🎉')
      setTotalSolved(t => t + 1)
      recordSolve(puzzle)
      if (isDaily && dailyInfo) {
        markDailyCompleted(dailyInfo.dateStr)
      }
      if (usedHint) {
        setStreak(0)
      } else {
        setStreak(s => s + 1)
      }
      if (settings.sound) playSolved()
      if (!usedHint) {
        fireConfettiFromElement(boardWrapRef, {
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
      computerTimerRef.current = setTimeout(() => {
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
  }, [moveIdx, puzzle, settings.sound, recordSolve, isDaily, dailyInfo, markDailyCompleted])

  // ── Move handler ──────────────────────────────────────────────────────────
  // Shared by both input methods: drag-and-drop (onDrop) and click/tap-to-move
  // (onSquareClick). Returns true if a move (correct or incorrect-but-legal)
  // was made, false if the move was illegal or couldn't be attempted.

  const attemptMove = useCallback((from, to) => {
    if (!game || !puzzle || replaying || (status !== 'playing' && status !== 'wrong')) return false

    const expected = puzzle.moves[moveIdx]
    if (!expected) return false

    // Clear any pending auto-solve timer — the player is making a new attempt.
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)

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
      recordMove(true)
      commitCorrectMove(copy, result)
      return true

    } else {
      // ✗ Wrong move — show the attempted move on the board (it stays where
      // it was dropped) along with red highlights and the message, until the
      // player chooses what to do next: use a hint, undo, or restart. Nothing
      // auto-clears or auto-resets.
      setStatus('wrong')
      setWrongFen(copy.fen())
      setHighlights({
        [from]: { background: 'rgba(220,38,38,.45)' },
        [to]:   { background: 'rgba(220,38,38,.45)' },
      })
      if (settings.sound) playWrong()
      recordMove(false)
      setHistory(h => (h.length && h[h.length - 1].wasWrong ? h : [...h, { fen: game.fen(), moveIdx, wasWrong: true }]))
      // Three-strike rule: 3 consecutive wrong attempts on this puzzle
      // auto-reveals the solution, resets the streak, and moves on.
      const nextWrongAttempts = wrongAttempts + 1
      setWrongAttempts(nextWrongAttempts)
      if (nextWrongAttempts >= 3) {
        setMsg(`❌ 3 wrong tries — showing the answer…`)
        autoSolveTimerRef.current = setTimeout(() => autoSolveRef.current?.(), 900)
      } else {
        setMsg(`Not quite — try again! (${nextWrongAttempts}/3)`)
      }
      return true
    }
  }, [game, puzzle, moveIdx, status, replaying, settings.sound, commitCorrectMove, recordMove, wrongAttempts])

  // Drag-and-drop entry point.
  const onDrop = useCallback((from, to) => {
    const moved = attemptMove(from, to)
    setSelectedSquare(null)
    setLegalTargets([])
    return moved
  }, [attemptMove])

  // Click/tap-to-move entry point. Works alongside drag-and-drop at all times.
  const onSquareClick = useCallback((square) => {
    if (!game || !puzzle || replaying || (status !== 'playing' && status !== 'wrong')) return

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
  }, [game, puzzle, status, replaying, selectedSquare, legalTargets, attemptMove])

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
    if (!game || !puzzle || replaying || (status !== 'playing' && status !== 'wrong')) return
    const expected = puzzle.moves[moveIdx]
    if (!expected) return
    const from = expected.slice(0, 2)
    const to = expected.slice(2, 4)

    // Clear any pending auto-solve timer — the player is taking a hint instead.
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)

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
  }, [game, puzzle, moveIdx, status, replaying, hintLevel, commitCorrectMove])

  // ── Explain (replay solution + show why it works) ─────────────────────────

  const handleExplain = useCallback(() => {
    if (!puzzle || !game || replaying || status === 'thinking') return
    if (computerTimerRef.current)  clearTimeout(computerTimerRef.current)
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)
    if (replayTimerRef.current)    clearTimeout(replayTimerRef.current)
    if (explainTimerRef.current)   clearTimeout(explainTimerRef.current)

    // Build the step data up-front (pure, no side effects)
    const steps = buildExplainSteps(puzzle)

    const prevStatus   = status
    const prevMsg      = msg
    const prevWrongFen = wrongFen

    setSelectedSquare(null)
    setLegalTargets([])
    setReplaying(true)
    setStatus('thinking')
    setMsg('Replaying the line…')
    setWrongFen(null)

    const chess = new Chess(puzzle.fen)
    setGame(new Chess(chess.fen()))
    setHighlights({})

    let i = 0
    const step = () => {
      if (i >= puzzle.moves.length) {
        // Replay done — restore game state then show the modal
        const lastFen = steps.length ? steps[steps.length - 1].fen : chess.fen()
        setGame(new Chess(lastFen))
        setStatus(prevStatus)
        setMsg(prevMsg)
        setWrongFen(prevWrongFen)
        setExplainSteps(steps)
        setExplainStepIdx(0)
        setExplainModal(true)
        setReplaying(false)
        return
      }
      const mv = chess.move(uciToObj(puzzle.moves[i]))
      setGame(new Chess(chess.fen()))
      if (mv) {
        setHighlights({
          [mv.from]: { background: 'rgba(96,165,250,.45)' },
          [mv.to]:   { background: 'rgba(96,165,250,.45)' },
        })
      }
      i++
      explainTimerRef.current = setTimeout(step, 650)
    }
    explainTimerRef.current = setTimeout(step, 500)
  }, [puzzle, game, replaying, status, msg, wrongFen])

  // ── Undo ───────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (history.length === 0 || status === 'thinking' || replaying) return
    const last = history[history.length - 1]
    if (computerTimerRef.current)  clearTimeout(computerTimerRef.current)
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)
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
    setWrongAttempts(0)
    hintUsedRef.current = false
  }, [history, status, replaying])

  // ── Auto-solve (three-strike limit reached) ────────────────────────────────

  const autoSolve = useCallback(() => {
    if (!game || !puzzle) return
    if (computerTimerRef.current)  clearTimeout(computerTimerRef.current)
    if (autoSolveTimerRef.current) clearTimeout(autoSolveTimerRef.current)
    if (replayTimerRef.current)    clearTimeout(replayTimerRef.current)
    if (explainTimerRef.current)   clearTimeout(explainTimerRef.current)

    setSelectedSquare(null)
    setLegalTargets([])
    setWrongFen(null)
    setReplaying(true)
    setStatus('thinking')
    setMsg("3 wrong attempts — here's the solution…")
    setStreak(0)
    setWrongAttempts(0)

    const chess = new Chess(game.fen())
    let idx = moveIdx

    const step = () => {
      const uci = puzzle.moves[idx]
      if (!uci) {
        setStatus('solved')
        setMsg('Solution shown — next puzzle…')
        setReplaying(false)
        replayTimerRef.current = setTimeout(() => goNextRef.current?.(), 1800)
        return
      }
      const mv = chess.move(uciToObj(uci))
      setGame(new Chess(chess.fen()))
      if (mv) {
        setHighlights({
          [mv.from]: { background: 'rgba(245,158,11,.55)' },
          [mv.to]:   { background: 'rgba(245,158,11,.55)' },
        })
      }
      idx++
      replayTimerRef.current = setTimeout(step, 650)
    }
    replayTimerRef.current = setTimeout(step, 500)
  }, [game, puzzle, moveIdx, setStreak])

  // ── Reset stats ───────────────────────────────────────────────────────────

  const handleResetStats = useCallback(() => {
    if (window.confirm('Reset your streak and total solved count? This cannot be undone.')) {
      resetStats()
    }
  }, [resetStats])

  // Close the explain modal and auto-advance to the next puzzle.
  const closeExplainModal = useCallback(() => {
    setExplainModal(false)
    setExplainSteps([])
    setExplainStepIdx(0)
    setHighlights({})
    goNextRef.current?.()
  }, [])

  goNextRef.current = goNext
  retryRef.current = retry
  hintRef.current = handleHint
  undoRef.current = handleUndo
  autoSolveRef.current = autoSolve

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
  const canUndo    = history.length > 0 && status !== 'thinking' && !replaying
  const canHint    = (status === 'playing' || status === 'wrong') && !replaying
  const canExplain = !!puzzle && !replaying && status !== 'thinking'

  return (
    <div className="app" ref={appRef}>
      {/* ── Puzzle Rush overlay ── */}
      {rushOpen && allPuzzles && (
        <PuzzleRush
          allPuzzles={allPuzzles}
          settings={settings}
          bestScore={rushBestScore}
          leaderboard={rushLeaderboard}
          onAddScore={addRushScore}
          onClose={() => setRushOpen(false)}
        />
      )}

      {/* ── Multiplayer Duel overlay ── */}
      {duelOpen && allPuzzles && (
        <MultiplayerDuel
          allPuzzles={allPuzzles}
          settings={settings}
          initialRoom={initialRoom}
          onClose={() => {
            setDuelOpen(false)
            // Remove ?room= from URL without reloading so sharing still works
            if (initialRoom) {
              window.history.replaceState({}, '', window.location.pathname)
            }
          }}
        />
      )}

      {/* ── Live Chess overlay ── */}
      {chessOpen && (
        <LiveChess
          settings={settings}
          initialRoom={initialChess}
          onClose={() => {
            setChessOpen(false)
            if (initialChess) {
              window.history.replaceState({}, '', window.location.pathname)
            }
          }}
          onReviewGame={(pgn, color) => {
            setReviewPgn(pgn)
            setReviewColor(color)
            setChessOpen(false)
            if (initialChess) window.history.replaceState({}, '', window.location.pathname)
            setReviewOpen(true)
          }}
        />
      )}

      {/* ── vs Computer overlay ── */}
      {computerOpen && (
        <ComputerChess
          settings={settings}
          userId={user?.id ?? null}
          onClose={() => setComputerOpen(false)}
          onReviewGame={(pgn, color) => {
            setReviewPgn(pgn)
            setReviewColor(color)
            setComputerOpen(false)
            setReviewOpen(true)
          }}
        />
      )}

      {/* ── Game Review overlay ── */}
      {reviewOpen && (
        <GameReview
          pgn={reviewPgn}
          playerColor={reviewColor}
          settings={settings}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {/* ── Achievement toast ── */}
      {newlyUnlocked[0] && (
        <div className="achievement-toast" key={newlyUnlocked[0].id} ref={toastRef}>
          <span className="toast-icon">{newlyUnlocked[0].icon}</span>
          <div className="toast-text">
            <div className="toast-title">Achievement Unlocked!</div>
            <div className="toast-name">{newlyUnlocked[0].name}</div>
          </div>
        </div>
      )}

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
          <button
            className="menu-btn"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span className="menu-btn-icon">☰</span>
            {dailyInfo && !dailyCompleted[dailyInfo.dateStr] && <span className="menu-dot" />}
          </button>
        </div>
      </header>

      {/* ── Full-screen menu overlay ── */}
      {menuOpen && (
        <div className="menu-overlay">
          <div className="menu-overlay-header">
            <h2>
              {activePanel === 'stats' ? 'Stats'
                : activePanel === 'achievements' ? `Achievements (${unlockedAchievements.length}/${achievements.length})`
                : activePanel === 'settings' ? 'Settings'
                : 'Menu'}
            </h2>
            <div className="menu-overlay-actions">
              {activePanel && (
                <button
                  className="settings-close-btn"
                  aria-label="Back"
                  onClick={() => setActivePanel(null)}
                >
                  ←
                </button>
              )}
              <button
                className="settings-close-btn"
                aria-label="Close menu"
                onClick={() => { setMenuOpen(false); setActivePanel(null) }}
              >
                ✕
              </button>
            </div>
          </div>

          {activePanel === null && (
            <div className="menu-list">
              <button
                className="menu-item"
                disabled={!dailyInfo}
                onClick={() => { toggleDaily(); setMenuOpen(false) }}
              >
                <span className="menu-item-icon">📅</span>
                <span className="menu-item-label">{isDaily ? 'Back to Puzzles' : "Today's Puzzle"}</span>
                {dailyInfo && dailyCompleted[dailyInfo.dateStr] && (
                  <span className="menu-item-badge done">✓</span>
                )}
              </button>
              <button
                className="menu-item"
                disabled={!allPuzzles}
                onClick={() => { setRushOpen(true); setMenuOpen(false) }}
              >
                <span className="menu-item-icon">⚡</span>
                <span className="menu-item-label">Puzzle Rush</span>
                {rushBestScore > 0 && (
                  <span className="menu-item-badge">{rushBestScore}</span>
                )}
              </button>
              <button
                className="menu-item"
                disabled={!allPuzzles}
                onClick={() => { setDuelOpen(true); setMenuOpen(false) }}
              >
                <span className="menu-item-icon">⚔️</span>
                <span className="menu-item-label">Duel a Friend</span>
              </button>
              <button
                className="menu-item"
                onClick={() => { setChessOpen(true); setMenuOpen(false) }}
              >
                <span className="menu-item-icon">♟</span>
                <span className="menu-item-label">Play Chess</span>
              </button>
              <button
                className="menu-item"
                onClick={() => { setComputerOpen(true); setMenuOpen(false) }}
              >
                <span className="menu-item-icon">🤖</span>
                <span className="menu-item-label">vs Computer</span>
              </button>
              <button className="menu-item" onClick={() => setActivePanel('stats')}>
                <span className="menu-item-icon">📊</span>
                <span className="menu-item-label">Stats</span>
                <span className="menu-item-badge">{totalSolved}</span>
              </button>
              <button className="menu-item" onClick={() => setActivePanel('achievements')}>
                <span className="menu-item-icon">🏆</span>
                <span className="menu-item-label">Achievements</span>
                <span className="menu-item-badge">
                  {unlockedAchievements.length}/{achievements.length}
                </span>
              </button>
              <button className="menu-item" onClick={() => setActivePanel('settings')}>
                <span className="menu-item-icon">⚙</span>
                <span className="menu-item-label">Settings</span>
              </button>
            </div>
          )}

          {activePanel === 'stats' && (
            <div className="settings-panel">
              <div className="settings-section">
                <div className="stats-overview">
                  <div className="stats-overview-row">
                    <span>Accuracy</span>
                    <span>{accuracy === null ? '—' : `${accuracy}%`}</span>
                  </div>
                  <div className="stats-overview-row">
                    <span>Total solved</span>
                    <span>{totalSolved}</span>
                  </div>
                  <div className="stats-overview-row">
                    <span>Current streak</span>
                    <span>{streak}</span>
                  </div>
                </div>

                <button className="link-btn" onClick={() => setShowBreakdown(b => !b)}>
                  {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
                </button>

                {showBreakdown && (
                  <div className="stats-breakdown">
                    <div className="stats-breakdown-group">
                      <div className="stats-breakdown-title">Solved by rating</div>
                      {RATING_BANDS.map(band => (
                        <div className="stats-breakdown-row" key={band.id}>
                          <span>{band.label}</span>
                          <span>{solvedByRating[band.id] || 0}</span>
                        </div>
                      ))}
                    </div>
                    <div className="stats-breakdown-group">
                      <div className="stats-breakdown-title">Solved by theme</div>
                      {puzzleThemeOptions.some(opt => solvedByTheme[opt.id]) ? (
                        puzzleThemeOptions
                          .filter(opt => solvedByTheme[opt.id])
                          .map(opt => (
                            <div className="stats-breakdown-row" key={opt.id}>
                              <span>{opt.label}</span>
                              <span>{solvedByTheme[opt.id]}</span>
                            </div>
                          ))
                      ) : (
                        <p className="settings-hint">No solves recorded yet</p>
                      )}
                    </div>
                  </div>
                )}

                {rushLeaderboard.length > 0 && (
                  <div className="rush-leaderboard rush-lb-inline">
                    <div className="rush-lb-title">⚡ Puzzle Rush — Top Runs</div>
                    {rushLeaderboard.map((entry, i) => (
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

                <button className="btn btn-danger" onClick={handleResetStats}>
                  Reset Stats
                </button>
              </div>
            </div>
          )}

          {activePanel === 'achievements' && (
            <div className="settings-panel">
              <div className="badge-grid">
                {achievements.map(a => {
                  const unlocked = unlockedAchievements.includes(a.id)
                  return (
                    <div className={`badge-card${unlocked ? ' unlocked' : ' locked'}`} key={a.id}>
                      <div className="badge-icon">{a.icon}</div>
                      <div className="badge-info">
                        <div className="badge-name">{a.name}</div>
                        <div className="badge-desc">{a.description}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activePanel === 'settings' && (
            <div className="settings-panel">
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
                <label className="settings-row">
                  <span>Adaptive difficulty</span>
                  <input
                    type="checkbox"
                    checked={settings.adaptiveDifficulty}
                    onChange={(e) => updateSettings({ adaptiveDifficulty: e.target.checked })}
                  />
                </label>
                <p className="settings-hint">
                  When on, "Next Puzzle" leans toward the harder end of your range
                  after strong accuracy, and the easier end after a rough patch.
                </p>
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

              <p className="settings-hint">
                Shortcuts: Enter/→ next · R retry · H hint · U undo · Esc close
              </p>

              <div className="settings-section">
                <div className="settings-section-title">Account</div>
                {isAnonymous ? (
                  <>
                    <p className="settings-hint">
                      {googleAlreadyLinked || (authError && authError.includes('already linked'))
                        ? 'This Google account is already linked (maybe on another device). Click "Sign in with Google" — do not use Link.'
                        : "You're playing as a guest. On a new device, use Sign in with Google. Link is only for first-time setup on this device."}
                    </p>
                    {authError && googleAlreadyLinked && (
                      <p className="settings-hint" style={{ color: '#fbbf24' }}>{authError}</p>
                    )}
                    <button
                      className="btn link-account-btn"
                      onClick={async () => {
                        const { error } = await signInWithGoogle()
                        if (error) {
                          const msg = typeof error === 'string' ? error : error.message
                          alert('Could not sign in with Google: ' + msg)
                        }
                      }}
                    >
                      🔑 Sign in with Google
                    </button>
                    {!googleAlreadyLinked && (
                      <button
                        className="btn btn-secondary"
                        style={{ marginTop: '0.5rem', width: '100%' }}
                        onClick={async () => {
                          const { error } = await linkGoogle()
                          if (error) {
                            const msg = typeof error === 'string' ? error : error.message
                            alert('Could not link Google account: ' + msg)
                          }
                        }}
                      >
                        🔗 Link Google Account (first time on this device)
                      </button>
                    )}
                  </>
                ) : user ? (
                  <p className="settings-hint">
                    ✅ Signed in{user.email ? ` as ${user.email}` : ' with Google'}.
                    Game history is synced to your account.
                  </p>
                ) : supabaseClient ? (
                  <>
                    <p className="settings-hint">
                      Guest sign-in failed{authError ? `: ${authError}` : ''}. Game history won't sync until this works.
                    </p>
                    <button
                      className="btn link-account-btn"
                      onClick={async () => {
                        const signedIn = await signInAnonymously()
                        if (!signedIn) alert('Still could not sign in. Run supabase/fix-auth-trigger.sql in the Supabase SQL Editor, then try again.')
                      }}
                    >
                      Retry sign-in
                    </button>
                  </>
                ) : (
                  <p className="settings-hint">Sign-in unavailable (Supabase not configured).</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Explain step-through modal ── */}
      {explainModal && explainSteps.length > 0 && (() => {
        const step    = explainSteps[explainStepIdx]
        const total   = explainSteps.length
        const hasPrev = explainStepIdx > 0
        const hasNext = explainStepIdx < total - 1
        return (
          <div className="explain-modal">
            <div className="explain-modal-header">
              <span className="explain-modal-title">Solution Walkthrough</span>
              <button
                className="settings-close-btn"
                aria-label="Close and go to next puzzle"
                onClick={closeExplainModal}
              >
                ✕
              </button>
            </div>

            <div className="explain-modal-step">
              <div className="explain-step-counter">
                Move {explainStepIdx + 1} of {total}
                <span className={`explain-step-badge ${step.isSetup ? 'setup' : step.isPlayer ? 'player' : 'opponent'}`}>
                  {step.isSetup ? 'Setup' : step.isPlayer ? 'Your Move' : 'Opponent'}
                </span>
              </div>
              <div className="explain-step-san">{step.san}</div>
              <p className="explain-step-why">{step.why}</p>
            </div>

            <div className="explain-modal-nav">
              <button
                className="btn btn-secondary"
                onClick={() => setExplainStepIdx(i => i - 1)}
                disabled={!hasPrev}
              >
                ◀ Prev
              </button>
              {hasNext ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setExplainStepIdx(i => i + 1)}
                >
                  Next ▶
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={closeExplainModal}
                >
                  Done — Next Puzzle →
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Puzzle info ── */}
      <div className="puzzle-info">
        {isDaily && <span className="daily-badge">📅 Daily Puzzle</span>}
        <span className="hint-badge">{hint}</span>
        <span className="turn-badge">
          {orientation === 'white' ? '⬜ White' : '⬛ Black'} to move
        </span>
        <span className="rating-badge">★ {puzzle.rating}</span>
        <span className="solved-badge">✅ {totalSolved}</span>
      </div>

      {/* ── Board ── */}
      <div
        ref={setBoardWrapNode}
        style={{ width: boardWidth }}
        className={`board-wrap${isWrong && settings.shake ? ' shake' : ''}${isSolved ? ' glow-green' : ''}`}
      >
        <Chessboard
          position={game.fen()}
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
          isDraggablePiece={({ piece }) => {
            if (replaying) return false
            if (status !== 'playing' && status !== 'wrong') return false
            const pieceColor = piece[0] === 'w' ? 'w' : 'b'
            return pieceColor === game.turn()
          }}
        />
      </div>

      {/* ── Controls (mobile-friendly buttons mirroring shortcuts) ── */}
      <div className="control-row" style={{ width: boardWidth }}>
        <button className="btn btn-secondary" onClick={handleUndo} disabled={!canUndo}>
          ↺ Undo
        </button>
        <button className="btn btn-secondary" onClick={handleHint} disabled={!canHint}>
          {hintLevel < 2 ? '💡 Hint' : '💡 Show Move'}
        </button>
        <button className="btn btn-secondary" onClick={handleExplain} disabled={!canExplain}>
          📖 Explain
        </button>
      </div>

      {/* ── Feedback ── */}
      <div className="feedback-area" style={{ width: boardWidth }}>
        {msg && (
          <p className={`feedback-msg ${isSolved ? 'success' : isWrong ? 'error' : 'info'}`}>
            {msg}
          </p>
        )}

        {isSolved && (
          isDaily ? (
            <button className="btn btn-primary" onClick={toggleDaily}>
              ← Back to Puzzles
            </button>
          ) : (
            <button className="btn btn-primary" onClick={goNext}>
              Next Puzzle →
            </button>
          )
        )}

        {isWrong && (
          <button className="btn btn-danger" onClick={retry}>
            ↺ Restart Puzzle
          </button>
        )}

        {!msg && status === 'playing' && (
          <p className="feedback-msg instruction">Drag, or tap to pick &amp; place, a piece to make your move</p>
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
