/**
 * Chess puzzles loaded from a bundled local JSON file (public/puzzles.json),
 * sourced from the Lichess puzzle database (CC0 licensed). 14,000 puzzles,
 * ratings 500-2000, covering a mix of themes.
 *
 * Format of each puzzle:
 *   id     - Lichess puzzle id
 *   fen    - position BEFORE the computer's setup move (side to move = computer)
 *   moves  - [computer_setup, player_move1, computer_response?, player_move2?, ...]
 *            All moves in UCI notation: "e2e4", "g7g8q" for promotion, etc.
 *   themes - e.g. ["mateIn1"], ["mateIn2", "sacrifice"]
 *   rating - approximate Lichess difficulty rating
 */

let cachedPuzzles = null

/**
 * Return true if a puzzle object has the minimum required shape.
 * Silently drops malformed rows so one bad entry can't crash the app.
 */
function isValidPuzzle(p) {
  return (
    p !== null &&
    typeof p === 'object' &&
    typeof p.id === 'string' && p.id.length > 0 &&
    typeof p.fen === 'string' && p.fen.length > 0 &&
    Array.isArray(p.moves) && p.moves.length >= 1 &&
    p.moves.every(m => typeof m === 'string' && m.length >= 4) &&
    Array.isArray(p.themes) &&
    typeof p.rating === 'number'
  )
}

/** Fetch and cache the local puzzle set. */
export async function loadPuzzles() {
  if (cachedPuzzles) return cachedPuzzles
  const res = await fetch(`${import.meta.env.BASE_URL}puzzles.json`)
  if (!res.ok) throw new Error(`Failed to load puzzles.json: ${res.status}`)
  const raw = await res.json()
  if (!Array.isArray(raw)) throw new Error('puzzles.json must be a JSON array')
  const valid = raw.filter(isValidPuzzle)
  if (valid.length === 0) throw new Error('puzzles.json contained no valid puzzles')
  if (valid.length < raw.length) {
    console.warn(`[puzzles] Dropped ${raw.length - valid.length} malformed puzzle(s)`)
  }
  cachedPuzzles = valid
  return cachedPuzzles
}

/** Return a shuffled copy of a puzzle list. */
export function getShuffledPuzzles(puzzles) {
  return [...puzzles].sort(() => Math.random() - 0.5)
}

/** Filter puzzles by theme keyword (case-insensitive substring). */
export function getPuzzlesByTheme(puzzles, theme) {
  const q = theme.toLowerCase()
  return puzzles.filter(p => p.themes.some(t => t.toLowerCase().includes(q)))
}

/**
 * Filter puzzles by rating range and (optionally) a set of themes.
 * If `themes` is empty, no theme filtering is applied.
 */
export function filterPuzzles(puzzles, { minRating = 0, maxRating = 9999, themes = [] } = {}) {
  return puzzles.filter(p => {
    if (p.rating < minRating || p.rating > maxRating) return false
    if (themes.length > 0 && !p.themes.some(t => themes.includes(t))) return false
    return true
  })
}

/** Simple deterministic string hash (32-bit). */
function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * Pick a deterministic "puzzle of the day" from the full puzzle set, based
 * on the player's local calendar date. The same date always yields the same
 * puzzle (for everyone, regardless of rating/theme filters), and a new
 * puzzle is picked each day.
 *
 * Returns `{ puzzle, dateStr }` where `dateStr` is "YYYY-MM-DD".
 */
export function getDailyPuzzle(puzzles, date = new Date()) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const idx = hashString(dateStr) % puzzles.length
  return { puzzle: puzzles[idx], dateStr }
}
