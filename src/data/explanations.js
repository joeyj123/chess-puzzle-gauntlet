import { Chess } from 'chess.js'

// ── Tactical theme descriptions ───────────────────────────────────────────────

const THEME_LABELS = {
  fork:              'Fork',
  pin:               'Pin',
  skewer:            'Skewer',
  sacrifice:         'Sacrifice',
  discoveredAttack:  'Discovered Attack',
  doubleCheck:       'Double Check',
  deflection:        'Deflection',
  attraction:        'Attraction',
  hangingPiece:      'Hanging Piece',
  trappedPiece:      'Trapped Piece',
  capturingDefender: 'Removing the Defender',
  clearance:         'Clearance',
  promotion:         'Promotion',
  backRankMate:      'Back Rank Mate',
  kingsideAttack:    'Kingside Attack',
  queensideAttack:   'Queenside Attack',
  defensiveMove:     'Defensive Resource',
  zugzwang:          'Zugzwang',
  xRayAttack:        'X-Ray Attack',
  exposedKing:       'Exposed King',
  endgame:           'Endgame Technique',
  middlegame:        'Middlegame Tactics',
  opening:           'Opening Trap',
}

const THEME_WHY = {
  fork:              'attacks two enemy pieces at once — one must be lost.',
  pin:               'pins a piece to a more valuable one behind it — the pinned piece cannot move safely.',
  skewer:            'forces a valuable piece to move, exposing a less valuable one behind it.',
  sacrifice:         'gives up material to force a decisive follow-up the opponent cannot stop.',
  discoveredAttack:  'moves one piece to unleash an attack from another piece that was behind it.',
  doubleCheck:       'delivers check from two pieces simultaneously — the king must move, no other defense works.',
  deflection:        'lures a key defender away from the square or piece it was protecting.',
  attraction:        'forces an enemy piece onto a square where it can be immediately exploited.',
  hangingPiece:      'wins a piece that was left unprotected.',
  trappedPiece:      'traps an enemy piece with no safe escape squares.',
  capturingDefender: 'removes the piece that was defending a key square, making the real threat unstoppable.',
  clearance:         'clears a square or line so another piece can deliver the decisive blow.',
  promotion:         'advances a pawn to the back rank to create a new powerful piece.',
  backRankMate:      'exploits the king trapped on the back rank with no escape squares.',
  kingsideAttack:    'targets the exposed kingside — the king has no shelter.',
  queensideAttack:   'opens lines toward the queenside to win material or deliver mate.',
  defensiveMove:     'defuses the opponent\'s threat with a precise defensive resource they did not see.',
  zugzwang:          'puts the opponent in zugzwang — every move makes their position worse.',
  xRayAttack:        'attacks through one piece to threaten a more valuable piece directly behind it.',
  exposedKing:       'exploits the king\'s lack of pawn cover — it is vulnerable to attack.',
  endgame:           'uses precise endgame technique to convert the advantage.',
  middlegame:        'seizes a tactical opportunity the opponent overlooked.',
  opening:           'punishes an inaccuracy in the opening.',
}

// ── Piece names ───────────────────────────────────────────────────────────────

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
function pieceName(type) { return PIECE_NAMES[type] || type }

// ── Build the per-move step array for the Explain modal ──────────────────────

/**
 * Build an array of step objects, one per move in puzzle.moves.
 * Each step: { fen, san, label, why, isPlayer }
 *
 * `fen`      — board position AFTER this move
 * `san`      — standard algebraic notation (e.g. "Rxd6+")
 * `label`    — short human label (e.g. "White plays Rxd6+")
 * `why`      — 1–2 sentence explanation of why this move was played
 * `isPlayer` — true for moves the player makes, false for opponent moves
 */
export function buildExplainSteps(puzzle) {
  if (!puzzle) return []
  try {
    return _buildSteps(puzzle)
  } catch (err) {
    console.error('[buildExplainSteps] Failed to build explanation steps:', err)
    return []
  }
}

function _buildSteps(puzzle) {
  const chess = new Chess(puzzle.fen)
  const themes = puzzle.themes || []

  // Determine which tactic theme applies (pick first match)
  const tacticTheme = themes.find(t => THEME_WHY[t])
  const mateTheme   = themes.find(t => /^mateIn\d$/.test(t))
  const mateN       = mateTheme ? parseInt(mateTheme.replace('mateIn', '')) : null

  const steps = []

  puzzle.moves.forEach((uci, i) => {
    const from = uci.slice(0, 2)
    const to   = uci.slice(2, 4)
    const promotion = uci[4] || undefined

    const targetSquare = chess.get(to)
    const isCapture    = !!targetSquare

    let result
    try {
      result = chess.move({ from, to, promotion })
    } catch {
      result = null
    }
    if (!result) return

    const san         = result.san
    const isPlayer    = i % 2 === 1  // index 0 = opponent setup; 1,3,5 = player; 2,4 = opponent reply
    const isSetup     = i === 0
    const colorName   = result.color === 'w' ? 'White' : 'Black'
    const movedPiece  = pieceName(result.piece)
    const isCheck     = san.includes('+')
    const isMate      = san.includes('#')
    const isPromo     = !!result.promotion

    const label = `${colorName} plays ${san}`

    let why = ''

    if (isSetup) {
      why = `This is the opponent's move that creates the puzzle — now it's your turn to find the winning reply.`

    } else if (!isPlayer) {
      // Opponent's forced response
      why = `The opponent is forced to play ${san}.`
      if (isCapture) why += ` They recapture to try to recover material.`
      if (isCheck)   why += ` This move also gives check.`

    } else {
      // Player's move — build the richest explanation we can
      const parts = []

      if (isMate) {
        parts.push(`${san} is checkmate — the king has no escape. Puzzle complete!`)
      } else {
        // Opening sentence: what the move does mechanically
        if (isPromo) {
          parts.push(`${san} promotes the pawn to a ${pieceName(result.promotion)}.`)
        } else if (isCapture) {
          parts.push(`${san} captures the ${pieceName(result.captured)} on ${to}.`)
        } else if (isCheck) {
          parts.push(`${san} moves the ${movedPiece} to ${to}, giving check.`)
        } else {
          parts.push(`${san} moves the ${movedPiece} to ${to}.`)
        }

        // Tactical explanation from puzzle theme
        if (mateN && i === 1) {
          // First player move in a mateIn puzzle — explain the theme
          parts.push(`This is move 1 of a forced mate in ${mateN} — the opponent has no defense.`)
        } else if (mateN) {
          parts.push(`This continues the forced mate — the opponent has no way to escape.`)
        } else if (tacticTheme && isPlayer) {
          const label2 = THEME_LABELS[tacticTheme] || tacticTheme
          const why2   = THEME_WHY[tacticTheme]
          parts.push(`This is the key ${label2} — it ${why2}`)
        }

        // Follow-up detail based on move type
        if (!mateN) {
          if (isCheck && !isMate) {
            parts.push(`The check forces the king to move, giving you tempo.`)
          }
          if (isCapture && !tacticTheme) {
            parts.push(`Winning this material gives a decisive advantage.`)
          }
        }
      }

      why = parts.join(' ')
    }

    steps.push({
      fen:      chess.fen(),
      san,
      label,
      why,
      isPlayer,
      isSetup,
    })
  })

  return steps
}
