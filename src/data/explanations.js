/**
 * Short, plain-language explanations of *why* a puzzle's solution works,
 * derived from the puzzle's Lichess theme tags. Used by the optional
 * "Post-solve explanation" setting.
 */
const THEME_EXPLANATIONS = {
  fork: 'forks two enemy pieces at once, winning material no matter which one moves',
  pin: 'pins a piece to a more valuable one behind it, so it can’t move without losing that piece',
  skewer: 'skewers two pieces in a line, winning the piece behind once the front one moves',
  sacrifice: 'sacrifices material to force a winning follow-up',
  discoveredAttack: 'uncovers an attack from another piece by moving out of its way',
  doubleCheck: 'delivers check from two pieces at once, forcing the king to move',
  deflection: 'deflects a defender away from a key square or piece',
  attraction: 'lures a piece onto a square where it can be exploited',
  hangingPiece: 'wins a piece that was left undefended',
  trappedPiece: 'traps an enemy piece with no safe squares to escape to',
  capturingDefender: 'removes the defender of a key square before delivering the real blow',
  clearance: 'clears a square or line so another piece can deliver the decisive blow',
  promotion: 'pushes a pawn toward promotion to create a new, decisive piece',
  backRankMate: 'delivers mate along the back rank, where the king has no escape squares',
  kingsideAttack: 'piles pressure on the kingside, where the enemy king is exposed',
  queensideAttack: 'opens lines on the queenside to attack the king or win material',
  defensiveMove: 'defuses the opponent’s threat with a precise defensive resource',
  zugzwang: 'puts the opponent in zugzwang — any move they make worsens their position',
  xRayAttack: 'attacks through an enemy piece to the more valuable one behind it',
  exposedKing: 'exploits a king left without any pawn cover',
  endgame: 'relies on precise endgame technique to convert the position',
  middlegame: 'exploits a tactical opportunity in the middlegame',
  opening: 'punishes an inaccuracy from very early in the game',
}

/**
 * Build a 1-2 sentence explanation for a puzzle based on its theme tags.
 * Returns '' if there's nothing useful to say.
 */
export function getExplanation(puzzle) {
  if (!puzzle) return ''
  const themes = puzzle.themes || []
  const parts = []

  const mateTheme = themes.find(t => /^mateIn\d$/.test(t))
  if (mateTheme) {
    const n = mateTheme.replace('mateIn', '')
    parts.push(`This is a forced mate in ${n} — every defense fails to the same idea.`)
  }

  const tacticTheme = themes.find(t => THEME_EXPLANATIONS[t])
  if (tacticTheme) {
    parts.push(`The winning idea ${THEME_EXPLANATIONS[tacticTheme]}.`)
  }

  if (parts.length === 0) {
    parts.push('The winning line is the most forcing sequence — checks, captures, and threats that leave no good reply.')
  }

  return parts.join(' ')
}
