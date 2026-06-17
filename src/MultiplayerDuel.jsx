/**
 * MultiplayerDuel — 1v1 puzzle race.
 *
 * Both players receive the same puzzle and race to solve it. The host picks the
 * puzzle, creates a room in Supabase, and shares a link. The guest opens that
 * link and joins. A countdown fires when both players are present, then each
 * player solves independently. First to solve wins.
 *
 * Props:
 *   allPuzzles  - full puzzle array (from App's state)
 *   settings    - app settings object (board theme, sound, shake)
 *   initialRoom - room code from URL param (null when hosting a new game)
 *   onClose     - called when overlay should be dismissed
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getBoardTheme } from './data/boardThemes'
import { playCorrect, playWrong, playSolved } from './sounds'
import { supabase } from './supabaseClient'
import QRShareCode from './QRShareCode'

// ── Local error boundary ──────────────────────────────────────────────────────
class DuelErrorBoundary extends Component {
  state = { crashed: false, msg: '' }
  static getDerivedStateFromError(err) { return { crashed: true, msg: String(err?.message || err) } }
  componentDidCatch(err) { console.error('[MultiplayerDuel] render error:', err) }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function uciToObj(uci) {
  return {
    from: uci.slice(0, 2),
    to:   uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci[4] } : {}),
  }
}

function generateRoomCode() {
  // e.g. "KR7X2Q" — 6 uppercase alphanumeric chars
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function getOrCreatePlayerId() {
  const key = 'cpg-player-id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function formatMs(ms) {
  if (ms == null) return '—'
  const secs = (ms / 1000).toFixed(1)
  return `${secs}s`
}

function getShareUrl(roomCode) {
  const base = window.location.origin + window.location.pathname
  return `${base}?room=${roomCode}`
}

// ── Phase machine ─────────────────────────────────────────────────────────────
// 'lobby'      → host waiting for guest (or guest joining)
// 'countdown'  → both present, 3-2-1 before puzzle appears
// 'playing'    → solving the puzzle
// 'results'    → finished, show winner

export default function MultiplayerDuel(props) {
  return (
    <DuelErrorBoundary onClose={props.onClose}>
      <MultiplayerDuelGame {...props} />
    </DuelErrorBoundary>
  )
}

function MultiplayerDuelGame({ allPuzzles, settings, initialRoom, onClose }) {
  const myId = useRef(getOrCreatePlayerId())

  // ── Connection state ────────────────────────────────────────────────────
  const [phase, setPhase]         = useState('lobby')
  const [role, setRole]           = useState(null)          // 'host' | 'guest'
  const [roomCode, setRoomCode]   = useState(null)
  const [roomError, setRoomError] = useState(null)
  const [copied, setCopied]       = useState(false)

  // ── Countdown ───────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(3)

  // ── Puzzle / game state ─────────────────────────────────────────────────
  const [puzzle,      setPuzzle]      = useState(null)
  const [game,        setGame]        = useState(null)
  const [moveIdx,     setMoveIdx]     = useState(1)
  const [orientation, setOrientation] = useState('white')
  const [highlights,  setHighlights]  = useState({})
  const [msg,         setMsg]         = useState('')
  const [msgType,     setMsgType]     = useState('info')
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [legalTargets,   setLegalTargets]   = useState([])

  // ── Timing ──────────────────────────────────────────────────────────────
  const startTimeRef     = useRef(null)
  const [mySolvedMs,     setMySolvedMs]     = useState(null)
  const [opponentSolved, setOpponentSolved] = useState(null) // { ms } | null

  // ── Board sizing ────────────────────────────────────────────────────────
  const boardWrapRef = useRef(null)
  const [boardWrapMounted, setBoardWrapMounted] = useState(false)
  const setBoardWrapNode = useCallback((node) => {
    boardWrapRef.current = node
    setBoardWrapMounted(!!node)
  }, [])
  const [boardWidth, setBoardWidth] = useState(() =>
    Math.max(MIN_BOARD, Math.floor(Math.min(
      window.innerWidth  - 40,
      window.innerHeight * 0.5,
    )))
  )

  useEffect(() => {
    if (!boardWrapMounted || !boardWrapRef.current) return
    const updateSize = () => {
      const { width, height } = boardWrapRef.current.getBoundingClientRect()
      setBoardWidth(Math.max(MIN_BOARD, Math.floor(Math.min(width, height))))
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(boardWrapRef.current)
    return () => ro.disconnect()
  }, [boardWrapMounted])

  // ── Misc refs ────────────────────────────────────────────────────────────
  const computerTimerRef = useRef(null)
  const channelRef       = useRef(null)
  const puzzleIdRef      = useRef(null) // set when room is created/joined

  // ── Supabase channel subscription ─────────────────────────────────────
  const subscribeToRoom = useCallback((code, myRole) => {
    if (!supabase) return
    const ch = supabase
      .channel(`room-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` },
        (payload) => {
          const row = payload.new
          // Guest joined — host sees this and moves to countdown
          if (myRole === 'host' && row.guest_id && row.guest_id !== myId.current) {
            startCountdown()
          }
          // Host confirmed guest joined — guest also starts countdown
          if (myRole === 'guest' && row.guest_id === myId.current) {
            startCountdown()
          }
          // Opponent solved
          const opponentMs = myRole === 'host' ? row.guest_solved_ms : row.host_solved_ms
          if (opponentMs != null) {
            setOpponentSolved({ ms: opponentMs })
          }
          // Both solved — go to results (handled reactively in useEffect below)
        }
      )
      .subscribe()
    channelRef.current = ch
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create room (host flow) ─────────────────────────────────────────────
  useEffect(() => {
    if (!initialRoom) {
      // Host: pick a puzzle, create the room
      if (!allPuzzles?.length) return
      const code = generateRoomCode()
      setRoomCode(code)
      setRole('host')

      const randomPuzzle = allPuzzles[Math.floor(Math.random() * allPuzzles.length)]
      puzzleIdRef.current = randomPuzzle.PuzzleId ?? randomPuzzle.id

      if (!supabase) return // offline/unconfigured — skip DB, still show lobby

      supabase
        .from('rooms')
        .insert({
          id:        code,
          puzzle_id: puzzleIdRef.current,
          host_id:   myId.current,
          status:    'waiting',
        })
        .then(({ error }) => {
          if (error) setRoomError('Could not create room. Please try again.')
        })

      subscribeToRoom(code, 'host')
    }
  }, [allPuzzles, initialRoom, subscribeToRoom])

  // ── Join room (guest flow) ──────────────────────────────────────────────
  useEffect(() => {
    if (!initialRoom || !allPuzzles?.length) return
    setRoomCode(initialRoom)
    setRole('guest')

    if (!supabase) {
      setRoomError('Multiplayer requires Supabase to be configured.')
      return
    }

    supabase
      .from('rooms')
      .select('*')
      .eq('id', initialRoom)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setRoomError('Room not found. The link may have expired.')
          return null
        }
        if (data.status === 'done') {
          setRoomError('This game is already finished.')
          return null
        }
        if (data.host_id === myId.current) {
          setRoomError("You can't join your own game — share this link with a friend!")
          return null
        }
        puzzleIdRef.current = data.puzzle_id
        // Update row with guest_id
        return supabase
          .from('rooms')
          .update({ guest_id: myId.current, status: 'playing' })
          .eq('id', initialRoom)
      })
      .then((result) => {
        // null means an error was already handled above — don't start the game
        if (result === null) return
        subscribeToRoom(initialRoom, 'guest')
        // Guest triggers countdown on their end immediately after joining
        startCountdown()
      })
      .catch(() => setRoomError('Failed to join room.'))
  }, [allPuzzles, initialRoom, subscribeToRoom])

  // ── Countdown logic ─────────────────────────────────────────────────────
  const countdownRef = useRef(null)

  const startCountdown = useCallback(() => {
    setPhase('countdown')
    setCountdown(3)
    let n = 3
    countdownRef.current = setInterval(() => {
      n -= 1
      setCountdown(n)
      if (n <= 0) {
        clearInterval(countdownRef.current)
        setPhase('playing')
      }
    }, 1000)
  }, [])

  // ── Load puzzle when playing starts ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !allPuzzles?.length || !puzzleIdRef.current) return
    const found = allPuzzles.find(
      p => (p.PuzzleId ?? p.id) === puzzleIdRef.current
    )
    if (!found) return
    loadPuzzle(found)
    startTimeRef.current = Date.now()
  }, [phase, allPuzzles])

  function loadPuzzle(p) {
    const g = new Chess(p.FEN ?? p.fen)
    const moves = (p.Moves ?? p.moves).split(' ')
    setGame(g)
    setPuzzle(p)
    setMoveIdx(1)
    setHighlights({})
    setSelectedSquare(null)
    setLegalTargets([])
    setMsg('')
    setMsgType('info')

    // Determine orientation: first move is the computer's — flip if needed
    const firstMoveColor = g.turn() // 'w' | 'b'
    setOrientation(firstMoveColor === 'w' ? 'black' : 'white')

    // Play computer's first move after brief delay
    clearTimeout(computerTimerRef.current)
    computerTimerRef.current = setTimeout(() => {
      const obj = uciToObj(moves[0])
      g.move(obj)
      setGame(new Chess(g.fen()))
      const from = moves[0].slice(0, 2)
      const to   = moves[0].slice(2, 4)
      setHighlights({ [from]: { background: 'rgba(255,200,0,0.55)' }, [to]: { background: 'rgba(255,200,0,0.55)' } })
    }, 400)
  }

  // ── Move handler ─────────────────────────────────────────────────────────
  function attemptMove(from, to, promotionPiece) {
    if (!game || !puzzle || phase !== 'playing' || mySolvedMs != null) return false

    const moves = (puzzle.Moves ?? puzzle.moves).split(' ')
    const expected = uciToObj(moves[moveIdx])

    const isPromotion =
      game.get(from)?.type === 'p' &&
      ((game.turn() === 'w' && to[1] === '8') || (game.turn() === 'b' && to[1] === '1'))

    const move = game.move({ from, to, promotion: isPromotion ? (promotionPiece ?? 'q') : undefined })
    if (!move) return false

    if (from === expected.from && to === expected.to) {
      if (settings.sounds) playCorrect()
      setHighlights({ [from]: { background: 'rgba(100,220,100,0.6)' }, [to]: { background: 'rgba(100,220,100,0.6)' } })
      setSelectedSquare(null)
      setLegalTargets([])
      setGame(new Chess(game.fen()))

      const nextMoveIdx = moveIdx + 1
      if (nextMoveIdx >= moves.length) {
        // Solved!
        handleSolved()
        return true
      }

      // Computer replies
      setMoveIdx(nextMoveIdx + 1)
      clearTimeout(computerTimerRef.current)
      computerTimerRef.current = setTimeout(() => {
        const reply = uciToObj(moves[nextMoveIdx])
        game.move(reply)
        const rf = moves[nextMoveIdx].slice(0, 2)
        const rt = moves[nextMoveIdx].slice(2, 4)
        setHighlights({ [rf]: { background: 'rgba(255,200,0,0.55)' }, [rt]: { background: 'rgba(255,200,0,0.55)' } })
        setGame(new Chess(game.fen()))
      }, 500)
    } else {
      // Wrong move
      if (settings.sounds) playWrong()
      if (settings.shake) {
        // brief shake feedback via msg
      }
      game.undo()
      setGame(new Chess(game.fen()))
      setMsg('Not the right move — keep trying!')
      setMsgType('error')
      setTimeout(() => setMsg(''), 1500)
      return false
    }
    return true
  }

  function handleSolved() {
    const elapsed = Date.now() - startTimeRef.current
    if (settings.sounds) playSolved()
    setMySolvedMs(elapsed)
    setMsg(`Solved in ${formatMs(elapsed)}!`)
    setMsgType('success')

    // Record in Supabase
    if (supabase && roomCode) {
      const col = role === 'host' ? 'host_solved_ms' : 'guest_solved_ms'
      supabase.from('rooms').update({ [col]: elapsed }).eq('id', roomCode).then(() => {})
    }
  }

  // ── Detect both solved → go to results ──────────────────────────────────
  useEffect(() => {
    if (mySolvedMs != null && opponentSolved != null) {
      const timeout = setTimeout(() => {
        setPhase('results')
        if (supabase && roomCode) {
          supabase.from('rooms').update({ status: 'done' }).eq('id', roomCode).then(() => {})
        }
      }, 1500)
      return () => clearTimeout(timeout)
    }
    // Also go to results if we solved but opponent hasn't yet after a long while — handled by "waiting" display
  }, [mySolvedMs, opponentSolved, roomCode, role])

  // ── Click-to-move (square selection) ────────────────────────────────────
  function onSquareClick(square) {
    if (!game || phase !== 'playing' || mySolvedMs != null) return
    const piece = game.get(square)
    const myColor = orientation === 'white' ? 'w' : 'b'

    if (selectedSquare) {
      if (legalTargets.includes(square)) {
        const moved = attemptMove(selectedSquare, square)
        if (!moved) {
          setSelectedSquare(null)
          setLegalTargets([])
        } else {
          setSelectedSquare(null)
          setLegalTargets([])
        }
        return
      }
      if (piece && piece.color === myColor) {
        setSelectedSquare(square)
        setLegalTargets(game.moves({ square, verbose: true }).map(m => m.to))
        return
      }
      setSelectedSquare(null)
      setLegalTargets([])
      return
    }

    if (piece && piece.color === myColor) {
      setSelectedSquare(square)
      setLegalTargets(game.moves({ square, verbose: true }).map(m => m.to))
    }
  }

  function onPieceDrop(from, to, piece) {
    const promotion = piece?.toLowerCase().replace(/[^qrbn]/, 'q')
    return attemptMove(from, to, promotion)
  }

  // ── Custom square styles ─────────────────────────────────────────────────
  function getCustomSquareStyles() {
    const styles = { ...highlights }
    if (selectedSquare) {
      styles[selectedSquare] = { background: 'rgba(100,180,255,0.7)' }
    }
    legalTargets.forEach(sq => {
      styles[sq] = { background: 'radial-gradient(circle, rgba(0,0,0,0.18) 36%, transparent 40%)' }
    })
    return styles
  }

  // ── Board theme ──────────────────────────────────────────────────────────
  const boardTheme = getBoardTheme(settings.boardTheme)

  // ── Copy link ────────────────────────────────────────────────────────────
  function copyLink() {
    if (!roomCode) return
    navigator.clipboard.writeText(getShareUrl(roomCode)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(computerTimerRef.current)
      clearInterval(countdownRef.current)
      if (channelRef.current) {
        supabase?.removeChannel(channelRef.current)
      }
    }
  }, [])

  // ── Render: not configured ───────────────────────────────────────────────
  if (!supabase) {
    return (
      <div className="duel-overlay">
        <div className="duel-unconfigured">
          <div className="duel-unconfigured-icon">🔧</div>
          <h2>Multiplayer not configured</h2>
          <p>
            To enable multiplayer, create a free{' '}
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

  // ── Render: error ────────────────────────────────────────────────────────
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

  // ── Render: lobby ────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    const shareUrl = roomCode ? getShareUrl(roomCode) : ''
    return (
      <div className="duel-overlay">
        <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>
        <div className="duel-lobby">
          {role === 'host' ? (
            <>
              <div className="duel-lobby-icon">⚔️</div>
              <h2>Challenge a Friend</h2>
              <p className="duel-lobby-desc">
                Share this link — when your friend opens it, the game starts!
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
                <p className="duel-waiting-text">Creating room…</p>
              )}
            </>
          ) : (
            <>
              <div className="duel-lobby-icon">⚔️</div>
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

  // ── Render: countdown ────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <div className="duel-overlay">
        <div className="duel-countdown-screen">
          <p className="duel-countdown-label">Get ready!</p>
          <div className="duel-countdown-number">{countdown}</div>
          <p className="duel-countdown-sub">Same puzzle — first to solve wins</p>
        </div>
      </div>
    )
  }

  // ── Render: results ──────────────────────────────────────────────────────
  if (phase === 'results') {
    const myMs = mySolvedMs
    const theirMs = opponentSolved?.ms ?? null
    const iWon = myMs != null && (theirMs == null || myMs < theirMs)
    const tied = myMs != null && theirMs != null && myMs === theirMs
    const iLost = !iWon && !tied

    return (
      <div className="duel-overlay">
        <div className="duel-results">
          <div className="duel-results-trophy">
            {tied ? '🤝' : iWon ? '🏆' : '💪'}
          </div>
          <h2 className={`duel-results-title ${iWon ? 'win' : iLost ? 'lose' : 'tie'}`}>
            {tied ? "It's a tie!" : iWon ? 'You win!' : 'Opponent wins!'}
          </h2>
          <div className="duel-results-times">
            <div className={`duel-results-row ${iWon ? 'winner' : ''}`}>
              <span className="duel-results-label">You</span>
              <span className="duel-results-time">
                {myMs != null ? formatMs(myMs) : "didn't finish"}
              </span>
            </div>
            <div className={`duel-results-row ${!iWon && !tied ? 'winner' : ''}`}>
              <span className="duel-results-label">Opponent</span>
              <span className="duel-results-time">
                {theirMs != null ? formatMs(theirMs) : "didn't finish"}
              </span>
            </div>
          </div>
          <div className="duel-results-actions">
            <button className="duel-btn duel-btn-primary" onClick={onClose}>
              Back to Solo
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: playing ──────────────────────────────────────────────────────
  return (
    <div className="duel-overlay">
      <button className="duel-close-btn" onClick={onClose} aria-label="Close">✕</button>

      {/* Opponent status bar */}
      <div className="duel-status-bar">
        <div className="duel-player-pill you">
          <span className="duel-player-label">You</span>
          <span className="duel-player-time">
            {mySolvedMs != null ? `✓ ${formatMs(mySolvedMs)}` : '…'}
          </span>
        </div>
        <span className="duel-vs">VS</span>
        <div className="duel-player-pill opponent">
          <span className="duel-player-label">Opponent</span>
          <span className="duel-player-time">
            {opponentSolved != null ? `✓ ${formatMs(opponentSolved.ms)}` : '…'}
          </span>
        </div>
      </div>

      {/* Board */}
      <div className="duel-board-wrap" ref={setBoardWrapNode}>
        {game && (
          <Chessboard
            id="duel-board"
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
            arePiecesDraggable={mySolvedMs == null}
          />
        )}
      </div>

      {/* Message */}
      {msg && (
        <div className={`duel-msg duel-msg-${msgType}`}>{msg}</div>
      )}

      {/* Waiting for opponent after solve */}
      {mySolvedMs != null && opponentSolved == null && (
        <div className="duel-waiting-opponent">
          <span className="duel-spinner">⏳</span> Waiting for opponent…
        </div>
      )}
    </div>
  )
}
