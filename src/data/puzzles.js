/**
 * Chess puzzles loaded from a bundled local JSON file (public/puzzles.json),
 * sourced from the Lichess puzzle database (CC0 licensed). 10,000 puzzles,
 * ratings 1000-2000, covering a mix of themes.
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

/** Fetch and cache the local puzzle set. */
export async function loadPuzzles() {
  if (cachedPuzzles) return cachedPuzzles
  const res = await fetch(`${import.meta.env.BASE_URL}puzzles.json`)
  if (!res.ok) throw new Error(`Failed to load puzzles.json: ${res.status}`)
  cachedPuzzles = await res.json()
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
