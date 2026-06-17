/**
 * ComputerChess — play a chess game against Stockfish.
 *
 * Phases: 'setup' → 'playing' → 'results'
 *
 * Props:
 *   settings      - app settings (boardTheme, sounds)
 *   onClose       - dismiss overlay
 *   onReviewGame  - called with (pgn, playerColor) when user wants to review
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getBoardTheme } from './data/boardThemes'
import { playCorrect, playWrong, playSolved } from './sounds'
import { useStockfish, DIFFICULTY_LEVELS, COMPUTER_MOVETIME_MS } from './useStockfish'
import { supabase } from './supabaseClient'

const MIN_BOARD = 160

function uciToObj(uci) {
  return {
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci[4] } : {}),
  }
}

// ── Local error boundary ──────────────────────────────────────────────────────
class ComputerChessErrorBoundary extends Component {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  componentDidCatch(err) { console.error('[ComputerChess] render error:', err) }
  render() {
    if (this.state.crashed) {
      return (
        <div className="duel-overlay">
          <div className="duel-unconfigured">
            <div className="duel-unconfigured-icon">⚠️</div>
            <h2>Error</h2>
            <p>Something went wrong. Please try again.</p>
            <button className="duel-btn duel-btn-primary" onClick={this.props.onClose}>Back</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ComputerChess(props) {
  return (
    <ComputerChessErrorBoundary onClose={props.onClose}>
      <ComputerChessGame {...props} />
    </ComputerChessErrorBoundary>
  )
}
// ComputerChessGame props: settings, userId, onClose, onReviewGame

function ComputerChessGame({ settings, userId, onClose, onReviewGame }) {
  const [phase, setPhase]         = useState('setup')   // 'setup' | 'playing' | 'results'
  const [diffIdx, setDiffIdx]     = useState(1)          // index into DIFFICULTY_LEVELS
  const [playerColor, setPlayerColor] = useState('white') // 'white' | 'black' | 'random'

  // ── Game state ───────────────────────────────────────────────────────────
  const [game,         setGame]         = useState(() => new Chess())
  const [orientation,  setOrientation]  = useState('white')
  const [highlights,   setHighlights]   = useState({})
  const [selectedSq,   setSelectedSq]   = useState(null)
  const [legalTargets, setLegalTargets] = useState([])
  const [lastMove,     setLastMove]     = useState(null)
  const [thinking,     setThinking]     = useState(false)
  const [result,       setResult]       = useState(null) // { winner: 'player'|'computer'|'draw', reason }

  // Track which color the human is playing
  const humanColorRef = useRef('w')

  // ── Board sizing ─────────────────────────────────────────────────────────
  const boardWrapRef = useRef(null)
  const [boardWrapMounted, setBoardWrapMounted] = useState(false)
  const setBoardWrapNode = useCallback((node) => {
    boardWrapRef.current = node
    setBoardWrapMounted(!!node)
  }, [])
  const [boardWidth, setBoardWidth] = useState(() =>
    Math.max(MIN_BOARD, Math.floor(Math.min(window.innerWidth - 40, window.innerHeight * 0.55)))
  )
  useEffect(() => {
    if (!boardWrapMounted || !boardWrapRef.current) return
    const update = () => {
      const { width, height } = boardWrapRef.current.getBoundingClientRect()
      setBoardWidth(Math.max(MIN_BOARD, Math.floor(Math.min(width, height))))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(boardWrapRef.current)
    return () => ro.disconnect()
  }, [boardWrapMounted])

  // ── Stockfish ────────────────────────────────────────────────────────────
  const { getBestMove, setSkillLevel, terminate } = useStockfish()
  const computerTimerRef = useRef(null)
  const workerWarmedRef = useRef(false)

  // Pre-warm Stockfish when overlay opens so first move isn't slow
  useEffect(() => {
    if (workerWarmedRef.current) return
    workerWarmedRef.current = true
    setSkillLevel(DIFFICULTY_LEVELS[diffIdx].skill)
    getBestMove(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      1,
      50,
      true,
    ).catch(() => {})
  }, [diffIdx, getBestMove, setSkillLevel])

  useEffect(() => () => {
    clearTimeout(computerTimerRef.current)
    terminate()
  }, [terminate])

  // ── Start game ───────────────────────────────────────────────────────────
  function startGame() {
    const color = playerColor === 'random'
      ? (Math.random() < 0.5 ? 'white' : 'black')
      : playerColor

    humanColorRef.current = color === 'white' ? 'w' : 'b'
    setOrientation(color)

    const level = DIFFICULTY_LEVELS[diffIdx]
    setSkillLevel(level.skill)

    const g = new Chess()
    setGame(g)
    setHighlights({})
    setSelectedSq(null)
    setLegalTargets([])
    setLastMove(null)
    setResult(null)
    setThinking(false)
    setPhase('playing')

    // If human plays Black, computer (White) moves first
    if (color === 'black') {
      scheduleComputerMove(g, level)
    }
  }

  function scheduleComputerMove(currentGame, level) {
    const lv = level ?? DIFFICULTY_LEVELS[diffIdx]
    clearTimeout(computerTimerRef.current)
    setSkillLevel(lv.skill)
    computerTimerRef.current = setTimeout(async () => {
      setThinking(true)
      let uci = null
      try {
        uci = await getBestMove(currentGame.fen(), lv.depth, COMPUTER_MOVETIME_MS, true)
      } catch (err) {
        console.error('[ComputerChess] getBestMove error:', err)
      }
      setThinking(false)
      if (!uci) {
        // Stockfish timed out or failed — make a random legal move to keep the game going
        const moves = currentGame.moves({ verbose: true })
        if (!moves.length) return
        const fallback = moves[Math.floor(Math.random() * moves.length)]
        uci = fallback.from + fallback.to + (fallback.promotion || '')
      }
      const obj = uciToObj(uci)
      const g2 = new Chess(currentGame.fen())
      const mv = g2.move(obj)
      if (!mv) return
      setLastMove({ from: mv.from, to: mv.to })
      setHighlights({})
      setGame(new Chess(g2.fen()))
      if (settings.sounds) playCorrect()
      checkGameOver(g2, 'computer-moved')
    }, 0)
  }

  // ── Move handler ─────────────────────────────────────────────────────────
  function isHumanTurn(g) {
    return g.turn() === humanColorRef.current
  }

  function attemptMove(from, to, promotionPiece) {
    if (!isHumanTurn(game) || thinking || result) return false

    const isPromotion =
      game.get(from)?.type === 'p' &&
      ((game.turn() === 'w' && to[1] === '8') || (game.turn() === 'b' && to[1] === '1'))

    const mv = game.move({ from, to, promotion: isPromotion ? (promotionPiece ?? 'q') : undefined })
    if (!mv) return false

    if (settings.sounds) playCorrect()
    const newGame = new Chess(game.fen())
    setGame(newGame)
    setLastMove({ from: mv.from, to: mv.to })
    setHighlights({})
    setSelectedSq(null)
    setLegalTargets([])

    if (!checkGameOver(newGame, 'human-moved')) {
      scheduleComputerMove(newGame, null)
    }
    return true
  }

  function checkGameOver(g, movedBy) {
    if (!g.isGameOver()) return false
    let winner = 'draw'
    let reason = 'Draw'
    if (g.isCheckmate()) {
      const justMoved = movedBy === 'human-moved' ? 'player' : 'computer'
      winner = justMoved
      reason = 'Checkmate'
    } else if (g.isStalemate()) {
      reason = 'Stalemate'
    } else if (g.isInsufficientMaterial()) {
      reason = 'Insufficient material'
    } else if (g.isThreefoldRepetition()) {
      reason = 'Threefold repetition'
    } else if (g.isDraw()) {
      reason = '50-move rule'
    }
    if (winner !== 'draw' && settings.sounds) playSolved()

    // Persist to game_history (fire-and-forget; never blocks the UI)
    saveGameToHistory(g, winner, reason)

    setResult({ winner, reason })
    setPhase('results')
    return true
  }

  function saveGameToHistory(g, winner, reason) {
    if (!supabase || !userId) return
    const outcome = winner === 'player' ? 'win' : winner === 'computer' ? 'loss' : 'draw'
    const level = DIFFICULTY_LEVELS[diffIdx]
    supabase.from('game_history').insert({
      user_id:       userId,
      opponent_name: `Stockfish ${level.label} (${level.elo})`,
      player_color:  humanColorRef.current === 'w' ? 'white' : 'black',
      game_outcome:  outcome,
      pgn_string:    g.pgn(),
      accuracy_score: null,  // filled in by GameReview engine post-analysis
    }).then(() => {}).catch(err => {
      console.warn('[ComputerChess] saveGameToHistory failed:', err.message)
    })
  }

  function handleResign() {
    if (!window.confirm('Resign this game?')) return
    setResult({ winner: 'computer', reason: 'Resignation' })
    setPhase('results')
  }

  // ── Click-to-move ─────────────────────────────────────────────────────────
  function onSquareClick(square) {
    if (!isHumanTurn(game) || thinking || result) return
    const piece = game.get(square)

    if (selectedSq) {
      if (legalTargets.includes(square)) {
        attemptMove(selectedSq, square)
        return
      }
      if (piece && piece.color === humanColorRef.current) {
        setSelectedSq(square)
        setLegalTargets(game.moves({ square, verbose: true }).map(m => m.to))
        return
      }
      setSelectedSq(null)
      setLegalTargets([])
      return
    }
    if (piece && piece.color === humanColorRef.current) {
      setSelectedSq(square)
      setLegalTargets(game.moves({ square, verbose: true }).map(m => m.to))
    }
  }

  function onPieceDrop(from, to, piece) {
    const promo = piece?.slice(-1).toLowerCase()
    return attemptMove(from, to, ['q','r','b','n'].includes(promo) ? promo : 'q')
  }

  // ── Square styles ─────────────────────────────────────────────────────────
  function getCustomSquareStyles() {
    try {
      const styles = {}
      if (lastMove) {
        styles[lastMove.from] = { background: 'rgba(255,200,0,0.4)' }
        styles[lastMove.to]   = { background: 'rgba(255,200,0,0.4)' }
      }
      if (selectedSq) styles[selectedSq] = { background: 'rgba(100,180,255,0.7)' }
      legalTargets.forEach(sq => {
        styles[sq] = { background: 'radial-gradient(circle, rgba(0,0,0,0.2) 36%, transparent 40%)' }
      })
      if (game.inCheck()) {
        const king = game.board().flat().find(p => p && p.type === 'k' && p.color === game.turn())
        if (king?.square) styles[king.square] = { background: 'rgba(239,68,68,0.55)' }
      }
      return styles
    } catch { return {} }
  }

  const boardTheme = getBoardTheme(settings?.boardTheme)
  const myTurn = phase === 'playing' && isHumanTurn(game) && !thinking && !result
  const inCheck = phase === 'playing' && (() => { try { return game.inCheck() && game.turn() === humanColorRef.current } catch { return false } })()
  const level = DIFFICULTY_LEVELS[diffIdx]

  // ── Render: setup ─────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="duel-overlay">
        <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="duel-lobby computer-setup">
          <div className="duel-lobby-icon">🤖</div>
          <h2>Play vs Computer</h2>

          <p className="computer-setup-label">Difficulty</p>
          <div className="computer-difficulty-grid">
            {DIFFICULTY_LEVELS.map((lv, i) => (
              <button
                key={lv.label}
                className={`computer-diff-btn ${i === diffIdx ? 'selected' : ''}`}
                onClick={() => setDiffIdx(i)}
              >
                <span className="computer-diff-name">{lv.label}</span>
                <span className="computer-diff-elo">{lv.elo}</span>
              </button>
            ))}
          </div>

          <p className="computer-setup-label">Play as</p>
          <div className="computer-color-row">
            {['white','black','random'].map(c => (
              <button
                key={c}
                className={`computer-color-btn ${playerColor === c ? 'selected' : ''}`}
                onClick={() => setPlayerColor(c)}
              >
                {c === 'white' ? '⬜ White' : c === 'black' ? '⬛ Black' : '🎲 Random'}
              </button>
            ))}
          </div>

          <button className="duel-btn duel-btn-primary computer-start-btn" onClick={startGame}>
            Start Game
          </button>
        </div>
      </div>
    )
  }

  // ── Render: results ───────────────────────────────────────────────────────
  if (phase === 'results' && result) {
    const iWon  = result.winner === 'player'
    const isDraw = result.winner === 'draw'
    return (
      <div className="duel-overlay">
        <div className="duel-results">
          <div className="duel-results-trophy">{isDraw ? '🤝' : iWon ? '🏆' : '💪'}</div>
          <h2 className={`duel-results-title ${iWon ? 'win' : isDraw ? 'tie' : 'lose'}`}>
            {isDraw ? "It's a draw!" : iWon ? 'You win!' : 'Computer wins!'}
          </h2>
          <p className="chess-result-reason">{result.reason}</p>
          <p className="computer-diff-played">vs {level.label} ({level.elo})</p>

          <div className="duel-results-actions">
            <button
              className="duel-btn duel-btn-secondary"
              onClick={() => onReviewGame(game.pgn(), humanColorRef.current)}
            >
              📊 Review Game
            </button>
            <button className="duel-btn duel-btn-primary" onClick={() => setPhase('setup')}>
              Play Again
            </button>
            <button className="duel-btn duel-btn-ghost" onClick={onClose}>
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: playing ───────────────────────────────────────────────────────
  return (
    <div className="duel-overlay chess-game-overlay">
      <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>

      <div className="chess-opponent-bar">
        🤖 <strong>{level.label}</strong>
        <span className="chess-opponent-elo">{level.elo}</span>
        {thinking && <span className="chess-thinking-dots">thinking…</span>}
      </div>

      <div className={`chess-status-bar ${inCheck ? 'in-check' : myTurn ? 'my-turn' : 'their-turn'}`}>
        {inCheck ? '⚠️ You are in check!' : thinking ? 'Computer is thinking…' : myTurn ? 'Your turn' : "Computer's turn…"}
      </div>

      <div className="duel-board-wrap" ref={setBoardWrapNode}>
        <Chessboard
          id="computer-chess-board"
          position={game.fen()}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          boardOrientation={orientation}
          boardWidth={boardWidth}
          customBoardStyle={{ borderRadius: '4px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
          customLightSquareStyle={{ backgroundColor: boardTheme.light }}
          customDarkSquareStyle={{ backgroundColor: boardTheme.dark }}
          customSquareStyles={getCustomSquareStyles()}
          animationDuration={150}
          arePiecesDraggable={myTurn}
          promotionDialogVariant="vertical"
        />
      </div>

      <div className="chess-controls">
        <button className="chess-resign-btn" onClick={handleResign}>Resign</button>
      </div>
    </div>
  )
}
