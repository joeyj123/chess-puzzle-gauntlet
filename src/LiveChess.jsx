/**
 * LiveChess — real-time 1v1 chess game.
 *
 * Host creates a room and shares a link (?chess=CODE). Guest opens the link
 * and joins. Host always plays white, guest always plays black. Moves are
 * written to Supabase and the opponent sees them instantly via Realtime.
 *
 * Props:
 *   settings    - app settings object (board theme, sound, shake)
 *   initialRoom - room code from ?chess= URL param (null when hosting)
 *   onClose     - called when the overlay should be dismissed
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getBoardTheme } from './data/boardThemes'
import { playCorrect, playWrong, playSolved } from './sounds'
import { supabase } from './supabaseClient'
import QRShareCode from './QRShareCode'

// ── Local error boundary ─────────────────────────────────────────────────────
// Catches any render/effect throw inside the game overlay and shows a friendly
// "Back" screen instead of letting it bubble up to the global error boundary.
class LiveChessErrorBoundary extends Component {
  state = { crashed: false, msg: '' }
  static getDerivedStateFromError(err) { return { crashed: true, msg: String(err?.message || err) } }
  componentDidCatch(err) { console.error('[LiveChess] render error:', err) }
  render() {
    if (this.state.crashed) {
      return (
        <div className="duel-overlay">
          <div className="duel-unconfigured">
            <div className="duel-unconfigured-icon">⚠️</div>
            <h2>Connection error</h2>
            <p>Something went wrong with the game. Please try again.</p>
            {this.state.msg && (
              <p style={{ fontSize: '0.72rem', color: '#f87171', wordBreak: 'break-all', maxWidth: 320 }}>
                {this.state.msg}
              </p>
            )}
            <button className="duel-btn duel-btn-primary" onClick={this.props.onClose}>
              Back
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const MIN_BOARD = 160
const START_FEN  = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function getOrCreatePlayerId() {
  const key = 'cpg-player-id'
  let id = localStorage.getItem(key)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
  return id
}

function getShareUrl(code) {
  const base = window.location.origin + window.location.pathname
  return `${base}?chess=${code}`
}

// Map chess.js piece codes to unicode symbols for the captured-pieces display
const PIECE_SYMBOLS = {
  wp: '♙', wr: '♖', wn: '♘', wb: '♗', wq: '♕',
  bp: '♟', br: '♜', bn: '♞', bb: '♝', bq: '♛',
}

// Derive captured pieces from a chess.js game instance
function getCaptured(game) {
  const startCount = { p:8, r:2, n:2, b:2, q:1 }
  const board = game.board().flat().filter(Boolean)
  const onBoard = { w:{}, b:{} }
  board.forEach(({ color, type }) => {
    onBoard[color][type] = (onBoard[color][type] || 0) + 1
  })
  const captured = { byWhite: [], byBlack: [] }
  Object.entries(startCount).forEach(([type, total]) => {
    const wMissing = total - (onBoard.w[type] || 0)
    const bMissing = total - (onBoard.b[type] || 0)
    for (let i = 0; i < bMissing; i++) captured.byWhite.push('b' + type) // white captured black pieces
    for (let i = 0; i < wMissing; i++) captured.byBlack.push('w' + type) // black captured white pieces
  })
  return captured
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiveChess(props) {
  return (
    <LiveChessErrorBoundary onClose={props.onClose}>
      <LiveChessGame {...props} />
    </LiveChessErrorBoundary>
  )
}

function LiveChessGame({ settings, initialRoom, onClose, onReviewGame, userId }) {
  const myId = useRef(getOrCreatePlayerId())
  // Guards against a double-save: the player who delivers checkmate/resigns
  // sees game-over locally AND (a moment later) via their own Supabase
  // realtime echo of the status update they just wrote.
  const savedHistoryRef = useRef(false)
  // subscribeToGame's realtime handler is memoized once on mount (see its
  // useCallback below) and would otherwise close over a stale `userId` from
  // that first render — mirror it in a ref so the closure always reads the
  // current value.
  const userIdRef = useRef(userId)
  useEffect(() => { userIdRef.current = userId }, [userId])

  // ── Connection state ─────────────────────────────────────────────────────
  const [phase, setPhase]         = useState('lobby')   // 'lobby' | 'playing' | 'results'
  const [role, setRole]           = useState(null)       // 'host' | 'guest'
  const [roomCode, setRoomCode]   = useState(null)
  const [roomError, setRoomError] = useState(null)
  const [copied, setCopied]       = useState(false)

  // ── Game state ───────────────────────────────────────────────────────────
  // game is the local chess.js instance, always kept in sync with Supabase FEN
  const [game,        setGame]        = useState(() => new Chess())
  const [orientation, setOrientation] = useState('white')
  const [highlights,  setHighlights]  = useState({})
  const [selectedSq,  setSelectedSq]  = useState(null)
  const [legalTargets, setLegalTargets] = useState([])
  const [lastMove,    setLastMove]    = useState(null)   // { from, to } for yellow highlight

  // ── Results ──────────────────────────────────────────────────────────────
  const [result, setResult] = useState(null) // { winner: 'host'|'guest'|'draw', reason: string }

  // ── Board sizing (same callback-ref pattern as App + MultiplayerDuel) ───
  const boardWrapRef = useRef(null)
  const [boardWrapMounted, setBoardWrapMounted] = useState(false)
  const setBoardWrapNode = useCallback((node) => {
    boardWrapRef.current = node
    setBoardWrapMounted(!!node)
  }, [])
  const [boardWidth, setBoardWidth] = useState(() =>
    Math.max(MIN_BOARD, Math.floor(Math.min(
      window.innerWidth  - 40,
      window.innerHeight * 0.55,
    )))
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

  // ── Misc refs ─────────────────────────────────────────────────────────────
  const channelRef = useRef(null)

  // ── Supabase Realtime subscription ──────────────────────────────────────
  const subscribeToGame = useCallback((code, myRole) => {
    if (!supabase) return
    const ch = supabase
      .channel(`chess-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chess_games', filter: `id=eq.${code}` },
        (payload) => {
          const row = payload.new

          // Guest joined — host transitions to playing
          if (myRole === 'host' && row.guest_id && row.status === 'playing') {
            setPhase('playing')
          }

          // Sync board state when the opponent has moved (their FEN update)
          if (row.fen && row.fen !== START_FEN) {
            setGame(prev => {
              try {
                if (prev.fen() === row.fen) return prev
                return new Chess(row.fen)
              } catch {
                return prev
              }
            })
            // Highlight last move if we can infer it from pgn
            tryHighlightLastMove(row.pgn)
          }

          // Game over via resign or server-detected end (this fires for
          // BOTH players — the one who triggered it locally already saved
          // via checkGameOver/handleResign, savedHistoryRef guards against
          // a double-save there; this is how the OTHER player's history
          // gets saved, since they only learn of game-over via this event)
          if (row.status === 'done' && row.winner) {
            saveGameToHistory(row.winner, row.pgn, myRole)
            setResult({ winner: row.winner, reason: row.winner === 'draw' ? 'Draw' : 'Resignation' })
            setPhase('results')
          }
        }
      )
      .subscribe()
    channelRef.current = ch
  }, [])

  function tryHighlightLastMove(pgn) {
    if (!pgn) return
    // pgn is space-separated move tokens; last SAN move gives us the squares
    // via chess.js history — we load a temp game to extract it
    try {
      const tmp = new Chess()
      const moves = pgn.trim().split(/\s+/).filter(t => !t.match(/^\d+\./))
      for (const san of moves) {
        const m = tmp.move(san)
        if (!m) break
        setLastMove({ from: m.from, to: m.to })
      }
    } catch {
      // silently ignore — highlight is cosmetic
    }
  }

  // ── Host: create game ────────────────────────────────────────────────────
  useEffect(() => {
    if (initialRoom) return // guest path — skip
    const code = generateRoomCode()
    setRoomCode(code)
    setRole('host')
    setOrientation('white')

    if (!supabase) return

    supabase
      .from('chess_games')
      .insert({
        id:      code,
        host_id: myId.current,
        fen:     START_FEN,
        pgn:     '',
        status:  'waiting',
      })
      .then(({ error }) => {
        if (error) setRoomError('Could not create game. Please try again.')
      })

    try { subscribeToGame(code, 'host') } catch (e) { console.error('[LiveChess] subscribe error:', e) }
  }, [initialRoom, subscribeToGame])

  // ── Guest: join game ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialRoom) return
    setRoomCode(initialRoom)
    setRole('guest')
    setOrientation('black')

    if (!supabase) {
      setRoomError('Multiplayer requires Supabase to be configured.')
      return
    }

    supabase
      .from('chess_games')
      .select('*')
      .eq('id', initialRoom)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setRoomError('Game not found. The link may have expired.')
          return null
        }
        if (data.status === 'done') {
          setRoomError('This game has already finished.')
          return null
        }
        if (data.host_id === myId.current) {
          setRoomError("You can't join your own game — share this link with a friend!")
          return null
        }
        if (data.guest_id && data.guest_id !== myId.current) {
          setRoomError('This game already has two players.')
          return null
        }
        // Restore board state in case guest reconnects mid-game
        if (data.fen && data.fen !== START_FEN) {
          setGame(new Chess(data.fen))
          tryHighlightLastMove(data.pgn)
        }
        return supabase
          .from('chess_games')
          .update({ guest_id: myId.current, status: 'playing' })
          .eq('id', initialRoom)
      })
      .then((result) => {
        if (result === null) return
        if (result?.error) {
          setRoomError('Failed to join game.')
          return
        }
        try { subscribeToGame(initialRoom, 'guest') } catch (e) { console.error('[LiveChess] subscribe error:', e) }
        setPhase('playing')
      })
      .catch(() => setRoomError('Failed to join game.'))
  }, [initialRoom, subscribeToGame])

  // Persist a finished multiplayer game to game_history (fire-and-forget;
  // never blocks the UI). `absWinner` is 'host' | 'guest' | 'draw'; `pgn` is
  // the full move list; `myRole` is passed explicitly (rather than read from
  // the `role` state) because this is also called from subscribeToGame's
  // realtime handler, which is memoized once on mount and would otherwise
  // see a stale role. Each player saves their own row (RLS requires
  // user_id = auth.uid()), so this runs once per player per game.
  function saveGameToHistory(absWinner, pgn, myRole) {
    const uid = userIdRef.current
    if (!supabase || !uid || savedHistoryRef.current) return
    savedHistoryRef.current = true
    const outcome = absWinner === 'draw' ? 'draw' : absWinner === myRole ? 'win' : 'loss'
    supabase.from('game_history').insert({
      user_id:       uid,
      game_mode:     'multiplayer',
      opponent_name: 'Online opponent',
      player_color:  myRole === 'host' ? 'white' : 'black',
      game_outcome:  outcome,
      pgn_string:    pgn,
      accuracy_score: null,
    }).then(() => {}).catch(err => {
      console.warn('[LiveChess] saveGameToHistory failed:', err.message)
    })
  }

  // ── Check for game-over after every local move ───────────────────────────
  function checkGameOver(g, myRole, code) {
    if (!g.isGameOver()) return false
    let winner = 'draw'
    let reason = 'Draw'
    if (g.isCheckmate()) {
      // The side that just moved (the one NOT in check) wins
      winner = g.turn() === 'w'
        ? (myRole === 'guest' ? 'guest' : 'host')   // black moved last, white to move but checkmated
        : (myRole === 'host'  ? 'host'  : 'guest')
      // Actually: after checkmate, g.turn() is the side that is in checkmate
      // The side that delivered checkmate is the one that just moved = myRole
      winner = myRole
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
    if (supabase && code) {
      supabase.from('chess_games').update({ status: 'done', winner }).eq('id', code).then(() => {})
    }
    saveGameToHistory(winner, g.pgn(), myRole)
    setResult({ winner, reason })
    setPhase('results')
    return true
  }

  // ── Move handler ─────────────────────────────────────────────────────────
  function isMyTurn(g) {
    if (!role) return false
    return (g.turn() === 'w' && role === 'host') || (g.turn() === 'b' && role === 'guest')
  }

  function attemptMove(from, to, promotionPiece) {
    if (phase !== 'playing' || !isMyTurn(game)) return false

    const isPromotion =
      game.get(from)?.type === 'p' &&
      ((game.turn() === 'w' && to[1] === '8') || (game.turn() === 'b' && to[1] === '1'))

    const move = game.move({
      from,
      to,
      promotion: isPromotion ? (promotionPiece ?? 'q') : undefined,
    })
    if (!move) return false

    if (settings.sounds) playCorrect()
    const newGame = new Chess(game.fen())
    setGame(newGame)
    setLastMove({ from: move.from, to: move.to })
    setHighlights({})
    setSelectedSq(null)
    setLegalTargets([])

    // Push to Supabase so the opponent sees it
    if (supabase && roomCode) {
      const pgn = newGame.pgn()
      supabase
        .from('chess_games')
        .update({ fen: newGame.fen(), pgn })
        .eq('id', roomCode)
        .then(() => {})
    }

    checkGameOver(newGame, role, roomCode)
    return true
  }

  // ── Click-to-move ─────────────────────────────────────────────────────────
  function onSquareClick(square) {
    if (phase !== 'playing' || !isMyTurn(game)) return
    const piece = game.get(square)
    const myColor = role === 'host' ? 'w' : 'b'

    if (selectedSq) {
      if (legalTargets.includes(square)) {
        attemptMove(selectedSq, square)
        return
      }
      if (piece && piece.color === myColor) {
        setSelectedSq(square)
        setLegalTargets(game.moves({ square, verbose: true }).map(m => m.to))
        return
      }
      setSelectedSq(null)
      setLegalTargets([])
      return
    }
    if (piece && piece.color === myColor) {
      setSelectedSq(square)
      setLegalTargets(game.moves({ square, verbose: true }).map(m => m.to))
    }
  }

  function onPieceDrop(from, to, piece) {
    const promotion = piece?.slice(-1).toLowerCase()
    return attemptMove(from, to, ['q','r','b','n'].includes(promotion) ? promotion : 'q')
  }

  // ── Resign ───────────────────────────────────────────────────────────────
  function handleResign() {
    if (!window.confirm('Resign this game?')) return
    const winner = role === 'host' ? 'guest' : 'host'
    if (supabase && roomCode) {
      supabase.from('chess_games').update({ status: 'done', winner }).eq('id', roomCode).then(() => {})
    }
    saveGameToHistory(winner, game.pgn(), role)
    setResult({ winner, reason: 'Resignation' })
    setPhase('results')
  }

  // ── Custom square styles ──────────────────────────────────────────────────
  function getCustomSquareStyles() {
    try {
      const styles = {}
      // Last-move yellow highlight
      if (lastMove) {
        styles[lastMove.from] = { background: 'rgba(255,200,0,0.4)' }
        styles[lastMove.to]   = { background: 'rgba(255,200,0,0.4)' }
      }
      // Selected piece
      if (selectedSq) styles[selectedSq] = { background: 'rgba(100,180,255,0.7)' }
      // Legal target dots
      legalTargets.forEach(sq => {
        styles[sq] = { background: 'radial-gradient(circle, rgba(0,0,0,0.18) 36%, transparent 40%)' }
      })
      // Check highlight
      if (game.inCheck()) {
        const kingSquare = game.board().flat().find(
          p => p && p.type === 'k' && p.color === game.turn()
        )?.square
        if (kingSquare) styles[kingSquare] = { background: 'rgba(239,68,68,0.55)' }
      }
      return styles
    } catch {
      return {}
    }
  }

  // ── Board theme ───────────────────────────────────────────────────────────
  const boardTheme = getBoardTheme(settings.boardTheme)

  // ── Copy link ─────────────────────────────────────────────────────────────
  function copyLink() {
    if (!roomCode) return
    navigator.clipboard.writeText(getShareUrl(roomCode)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase?.removeChannel(channelRef.current)
    }
  }, [])

  // ── Derived display values ────────────────────────────────────────────────
  const myColor       = role === 'host' ? 'w' : 'b'
  const myTurn        = phase === 'playing' && isMyTurn(game)
  const inCheck       = phase === 'playing' && (() => { try { return game.inCheck() && game.turn() === myColor } catch { return false } })()
  const captured      = (() => { try { return getCaptured(game) } catch { return { byWhite: [], byBlack: [] } } })()
  const myCaptured    = role === 'host' ? captured.byWhite : captured.byBlack  // pieces I captured
  const theirCaptured = role === 'host' ? captured.byBlack : captured.byWhite

  // Result display helpers
  function getResultTitle() {
    if (!result) return ''
    if (result.winner === 'draw') return "It's a draw!"
    const iWon = result.winner === role
    return iWon ? 'You win!' : 'You lose.'
  }
  function getResultIcon() {
    if (!result) return ''
    if (result.winner === 'draw') return '🤝'
    return result.winner === role ? '🏆' : '💪'
  }

  // ── Not configured ────────────────────────────────────────────────────────
  if (!supabase) {
    return (
      <div className="duel-overlay">
        <div className="duel-unconfigured">
          <div className="duel-unconfigured-icon">🔧</div>
          <h2>Multiplayer not configured</h2>
          <p>
            To enable live chess, create a free{' '}
            <a href="https://supabase.com" target="_blank" rel="noreferrer">Supabase</a>{' '}
            project and add your credentials to <code>.env.local</code>.
          </p>
          <p className="duel-unconfigured-hint">
            See <strong>MULTIPLAYER_SETUP.md</strong> in the project root for step-by-step instructions.
          </p>
          <button className="duel-btn duel-btn-primary" onClick={onClose}>Back</button>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (roomError) {
    return (
      <div className="duel-overlay">
        <div className="duel-unconfigured">
          <div className="duel-unconfigured-icon">⚠️</div>
          <h2>Oops</h2>
          <p>{roomError}</p>
          <button className="duel-btn duel-btn-primary" onClick={onClose}>Back</button>
        </div>
      </div>
    )
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const shareUrl = roomCode ? getShareUrl(roomCode) : ''
    return (
      <div className="duel-overlay">
        <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="duel-lobby">
          {role === 'host' ? (
            <>
              <div className="duel-lobby-icon">♟</div>
              <h2>Play Chess</h2>
              <p className="duel-lobby-desc">
                Share this link with your opponent. You'll play <strong>White</strong>, they'll play <strong>Black</strong>.
              </p>
              {roomCode ? (
                <>
                  <div className="duel-share-box">
                    <span className="duel-share-url">{shareUrl}</span>
                    <button className="duel-copy-btn" onClick={copyLink}>
                      {copied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="duel-room-code">Room: <strong>{roomCode}</strong></div>
                  <div className="duel-qr-wrap">
                    <QRShareCode url={shareUrl} size={160} />
                    <p className="duel-qr-hint">Scan to join</p>
                  </div>
                  <p className="duel-waiting-text">
                    <span className="duel-spinner">⏳</span> Waiting for opponent to join…
                  </p>
                </>
              ) : (
                <p className="duel-waiting-text">Creating game…</p>
              )}
            </>
          ) : (
            <>
              <div className="duel-lobby-icon">♟</div>
              <h2>Joining Game…</h2>
              <p className="duel-lobby-desc">Room: <strong>{roomCode}</strong></p>
              <p className="duel-waiting-text">
                <span className="duel-spinner">⏳</span> Connecting…
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (phase === 'results') {
    const iWon = result?.winner === role
    const isDraw = result?.winner === 'draw'
    return (
      <div className="duel-overlay">
        <div className="duel-results">
          <div className="duel-results-trophy">{getResultIcon()}</div>
          <h2 className={`duel-results-title ${iWon ? 'win' : isDraw ? 'tie' : 'lose'}`}>
            {getResultTitle()}
          </h2>
          {result?.reason && (
            <p className="chess-result-reason">{result.reason}</p>
          )}
          <div className="duel-results-actions">
            {onReviewGame && (
              <button
                className="duel-btn duel-btn-secondary"
                onClick={() => onReviewGame(game.pgn(), role === 'host' ? 'w' : 'b')}
              >
                📊 Review Game
              </button>
            )}
            <button className="duel-btn duel-btn-primary" onClick={onClose}>
              Back to Solo
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  return (
    <div className="duel-overlay chess-game-overlay">
      <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>

      {/* Opponent's captured pieces (shown at top) */}
      <div className="chess-captured-row">
        {theirCaptured.map((p, i) => (
          <span key={i} className="chess-captured-piece">{PIECE_SYMBOLS[p]}</span>
        ))}
      </div>

      {/* Turn / status indicator — single element, no flash */}
      <div className={`chess-status-bar ${inCheck ? 'in-check' : myTurn ? 'my-turn' : 'their-turn'}`}>
        {inCheck ? '⚠️ You are in check!' : myTurn ? 'Your turn' : "Opponent's turn…"}
      </div>

      {/* Board */}
      <div className="duel-board-wrap" ref={setBoardWrapNode}>
        <Chessboard
          id="live-chess-board"
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

      {/* My captured pieces (shown at bottom) */}
      <div className="chess-captured-row">
        {myCaptured.map((p, i) => (
          <span key={i} className="chess-captured-piece">{PIECE_SYMBOLS[p]}</span>
        ))}
      </div>

      {/* Resign button */}
      <div className="chess-controls">
        <button className="chess-resign-btn" onClick={handleResign}>
          Resign
        </button>
      </div>
    </div>
  )
}
