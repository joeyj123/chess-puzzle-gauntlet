/**
 * GameReview — post-game analysis overlay powered by Stockfish.
 *
 * Analyzes every position in the PGN at depth 10, classifies each move
 * (Best / Excellent / Good / Inaccuracy / Mistake / Blunder), and shows
 * accuracy % for each player.
 *
 * Props:
 *   pgn          - PGN string of the game to review
 *   playerColor  - 'w' | 'b' (which side the human played; for display labels)
 *   settings     - app settings (boardTheme)
 *   onClose      - dismiss overlay
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getBoardTheme } from './data/boardThemes'
import { useStockfish, classifyMove, moveAccuracy, getClassificationSummary } from './useStockfish'

const MIN_BOARD = 160
const ANALYSIS_DEPTH = 10   // depth per position — fast enough in browser

// ── Local error boundary ──────────────────────────────────────────────────────
class GameReviewErrorBoundary extends Component {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  componentDidCatch(err) { console.error('[GameReview] render error:', err) }
  render() {
    if (this.state.crashed) {
      return (
        <div className="duel-overlay">
          <div className="duel-unconfigured">
            <div className="duel-unconfigured-icon">⚠️</div>
            <h2>Review error</h2>
            <p>Could not load the game review. Please try again.</p>
            <button className="duel-btn duel-btn-primary" onClick={this.props.onClose}>Back</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function GameReview(props) {
  return (
    <GameReviewErrorBoundary onClose={props.onClose}>
      <GameReviewInner {...props} />
    </GameReviewErrorBoundary>
  )
}

// Move classification display config — aligned with updated classifyMove thresholds
const CLASS_CONFIG = {
  best:       { label: 'Best',       symbol: '!!', color: '#22c55e' },
  excellent:  { label: 'Excellent',  symbol: '!',  color: '#86efac' },
  good:       { label: 'Good',       symbol: '✓',  color: '#bef264' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#fbbf24' },
  blunder:    { label: 'Blunder',    symbol: '??', color: '#ef4444' },
}

function GameReviewInner({ pgn, playerColor = 'w', settings, onClose }) {
  // ── Analysis state ────────────────────────────────────────────────────────
  const [analysisPhase, setAnalysisPhase] = useState('loading') // 'loading'|'analyzing'|'done'
  const [progress, setProgress]           = useState(0)
  const [totalMoves, setTotalMoves]       = useState(0)
  const [moveData, setMoveData]           = useState([])   // array of analyzed move objects
  const [accuracyW, setAccuracyW]         = useState(null)
  const [accuracyB, setAccuracyB]         = useState(null)
  const abortRef = useRef(false)

  // ── Replay state ──────────────────────────────────────────────────────────
  const [positions, setPositions]   = useState([])   // array of FEN strings (index 0 = start)
  const [viewIdx, setViewIdx]       = useState(0)    // which position we're viewing

  // ── Board sizing ──────────────────────────────────────────────────────────
  const boardWrapRef = useRef(null)
  const [boardWrapMounted, setBoardWrapMounted] = useState(false)
  const setBoardWrapNode = useCallback((node) => {
    boardWrapRef.current = node
    setBoardWrapMounted(!!node)
  }, [])
  const [boardWidth, setBoardWidth] = useState(() =>
    Math.max(MIN_BOARD, Math.floor(Math.min(window.innerWidth - 40, window.innerHeight * 0.5)))
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

  // ── Stockfish ─────────────────────────────────────────────────────────────
  const { analyzePosition, terminate } = useStockfish()

  useEffect(() => () => {
    abortRef.current = true
    terminate()
  }, [terminate])

  // ── Load & analyze ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pgn) return

    async function run() {
      // Parse PGN
      const g = new Chess()
      try { g.loadPgn(pgn) } catch { setAnalysisPhase('done'); return }

      const history  = g.history({ verbose: true })
      const total    = history.length
      setTotalMoves(total)

      // Build position list
      const fens = []
      const tmp = new Chess()
      fens.push(tmp.fen())
      for (const mv of history) {
        tmp.move(mv)
        fens.push(tmp.fen())
      }
      setPositions(fens)
      setAnalysisPhase('analyzing')

      // ── Evaluate every position exactly once ──────────────────────────────
      // "After move i" is the same position as "before move i+1", so a
      // single pass over all (total + 1) positions gives us every score we
      // need — half the Stockfish searches of evaluating each position twice.
      const scores     = new Array(total + 1).fill(0)
      const bestMoves   = new Array(total + 1).fill(null)

      for (let i = 0; i <= total; i++) {
        if (abortRef.current) return
        const { score, bestMove } = await analyzePosition(fens[i], ANALYSIS_DEPTH)
        if (abortRef.current) return
        scores[i]     = score
        bestMoves[i]  = bestMove
        setProgress(Math.min(i + 1, total))
      }

      // Clamp mate scores, then build per-move classification from the
      // before/after pair we already have.
      const clamp = (s) => Math.max(-9999, Math.min(9999, s))
      const results = []
      let wAccSum = 0, wCount = 0
      let bAccSum = 0, bCount = 0

      for (let i = 0; i < total; i++) {
        // cpLoss = score_before + score_after
        // (score_after is from opponent's perspective, so add = flip)
        const cpLoss = Math.max(0, clamp(scores[i]) + clamp(scores[i + 1]))

        const classification = classifyMove(cpLoss)
        const accuracy       = moveAccuracy(cpLoss)
        const mv             = history[i]
        const color          = mv.color  // 'w' | 'b'
        const bestMove       = bestMoves[i]

        results.push({
          ply:      i + 1,
          color,
          san:      mv.san,
          from:     mv.from,
          to:       mv.to,
          cpLoss,
          classification,
          accuracy,
          bestMove: bestMove !== mv.lan ? bestMove : null,  // only show if different from played
          fenBefore: fens[i],
          fenAfter:  fens[i + 1],
        })

        if (color === 'w') { wAccSum += accuracy; wCount++ }
        else               { bAccSum += accuracy; bCount++ }
      }

      setMoveData(results)

      setAccuracyW(wCount > 0 ? Math.round(wAccSum / wCount) : null)
      setAccuracyB(bCount > 0 ? Math.round(bAccSum / bCount) : null)
      setAnalysisPhase('done')
    }

    run()
  }, [pgn, analyzePosition])

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft')  setViewIdx(i => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setViewIdx(i => Math.min(positions.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [positions.length])

  const boardTheme = getBoardTheme(settings?.boardTheme)
  const currentFen = positions[viewIdx] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const currentMove = viewIdx > 0 ? moveData[viewIdx - 1] : null
  const bestMoveArrows = currentMove?.bestMove
    ? [[currentMove.bestMove.slice(0, 2), currentMove.bestMove.slice(2, 4), 'rgb(0,180,100)']]
    : []

  // Group moves into pairs for the move list
  const movePairs = []
  for (let i = 0; i < moveData.length; i += 2) {
    movePairs.push({ num: Math.floor(i / 2) + 1, white: moveData[i], black: moveData[i + 1] })
  }

  const playerLabel = playerColor === 'w' ? 'White' : 'Black'
  const oppLabel    = playerColor === 'w' ? 'Black' : 'White'
  const playerAcc   = playerColor === 'w' ? accuracyW : accuracyB
  const oppAcc      = playerColor === 'w' ? accuracyB : accuracyW

  // ── Render: loading / analyzing ───────────────────────────────────────────
  if (analysisPhase !== 'done') {
    const pct = totalMoves > 0 ? Math.round((progress / totalMoves) * 100) : 0
    return (
      <div className="duel-overlay">
        <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="review-loading">
          <div className="review-loading-icon">🔍</div>
          <h2>Analyzing game…</h2>
          <p className="review-loading-sub">
            {analysisPhase === 'loading' ? 'Loading…' : `${progress} / ${totalMoves} moves`}
          </p>
          <div className="review-progress-bar">
            <div className="review-progress-fill" style={{ width: pct + '%' }} />
          </div>
          <p className="review-loading-hint">Stockfish is reviewing each position.</p>
        </div>
      </div>
    )
  }

  // ── Render: done ──────────────────────────────────────────────────────────
  return (
    <div className="duel-overlay review-overlay">
      <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>

      {/* Accuracy summary */}
      <div className="review-accuracy-bar">
        <div className="review-acc-pill you">
          <span className="review-acc-label">{playerLabel} (You)</span>
          <span className="review-acc-value">{playerAcc != null ? playerAcc + '%' : '—'}</span>
        </div>
        <span className="review-acc-sep">Accuracy</span>
        <div className="review-acc-pill opp">
          <span className="review-acc-label">{oppLabel}</span>
          <span className="review-acc-value">{oppAcc != null ? oppAcc + '%' : '—'}</span>
        </div>
      </div>

      {/* Current move classification + dynamic summary */}
      {currentMove && (() => {
        const cfg = CLASS_CONFIG[currentMove.classification.cls] ?? CLASS_CONFIG.blunder
        const summary = getClassificationSummary(currentMove.classification.cls, currentMove.cpLoss)
        return (
          <div className="review-move-badge-wrap">
            <div className="review-move-badge" style={{ color: cfg.color }}>
              <span className="review-move-symbol">{cfg.symbol}</span>
              <span className="review-move-san">{currentMove.san}</span>
              <span className="review-move-label">{cfg.label}</span>
              {currentMove.cpLoss > 5 && (
                <span className="review-move-loss">−{currentMove.cpLoss}cp</span>
              )}
            </div>
            {summary && (
              <p className="review-move-summary">{summary}</p>
            )}
          </div>
        )
      })()}

      {/* Board */}
      <div className="duel-board-wrap" ref={setBoardWrapNode}>
        <Chessboard
          id="review-board"
          position={currentFen}
          boardOrientation={playerColor === 'w' ? 'white' : 'black'}
          boardWidth={boardWidth}
          arePiecesDraggable={false}
          customBoardStyle={{ borderRadius: '4px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
          customLightSquareStyle={{ backgroundColor: boardTheme.light }}
          customDarkSquareStyle={{ backgroundColor: boardTheme.dark }}
          customArrows={bestMoveArrows}
          customSquareStyles={currentMove ? {
            [currentMove.from]: { background: 'rgba(255,200,0,0.4)' },
            [currentMove.to]:   { background: 'rgba(255,200,0,0.4)' },
          } : {}}
          animationDuration={100}
        />
      </div>

      {/* Best move hint */}
      {currentMove?.bestMove && (
        <p className="review-best-move-hint">
          Best: <strong>{currentMove.bestMove.slice(0, 2)}→{currentMove.bestMove.slice(2, 4)}</strong>
          <span className="review-best-arrow"> (green arrow)</span>
        </p>
      )}

      {/* Navigation */}
      <div className="review-nav">
        <button className="review-nav-btn" onClick={() => setViewIdx(0)} disabled={viewIdx === 0}>⏮</button>
        <button className="review-nav-btn" onClick={() => setViewIdx(i => Math.max(0, i - 1))} disabled={viewIdx === 0}>◀</button>
        <span className="review-nav-pos">{viewIdx === 0 ? 'Start' : `Move ${viewIdx}`}</span>
        <button className="review-nav-btn" onClick={() => setViewIdx(i => Math.min(positions.length - 1, i + 1))} disabled={viewIdx === positions.length - 1}>▶</button>
        <button className="review-nav-btn" onClick={() => setViewIdx(positions.length - 1)} disabled={viewIdx === positions.length - 1}>⏭</button>
      </div>

      {/* Move list */}
      <div className="review-move-list">
        {movePairs.map(({ num, white, black }) => (
          <div key={num} className="review-move-row">
            <span className="review-move-num">{num}.</span>
            <MoveCell mv={white} active={viewIdx === white?.ply} onClick={() => white && setViewIdx(white.ply)} />
            <MoveCell mv={black} active={viewIdx === black?.ply} onClick={() => black && setViewIdx(black.ply)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MoveCell({ mv, active, onClick }) {
  if (!mv) return <span className="review-move-cell empty" />
  const cfg = CLASS_CONFIG[mv.classification.cls]
  return (
    <button
      className={`review-move-cell ${active ? 'active' : ''}`}
      onClick={onClick}
      style={{ borderColor: active ? cfg.color : 'transparent' }}
    >
      <span className="review-move-san-cell">{mv.san}</span>
      <span className="review-move-sym-cell" style={{ color: cfg.color }}>{mv.classification.symbol}</span>
    </button>
  )
}
