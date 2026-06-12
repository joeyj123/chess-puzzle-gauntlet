import { useState, useEffect } from 'react'

const STORAGE_KEY = 'cpg-stats'

/** Rating bands used for the "solved by rating" breakdown. */
export const RATING_BANDS = [
  { id: '500-999',   label: '500–999',   min: 0,    max: 999 },
  { id: '1000-1499', label: '1000–1499', min: 1000, max: 1499 },
  { id: '1500-1999', label: '1500–1999', min: 1500, max: 1999 },
  { id: '2000+',     label: '2000+',     min: 2000, max: Infinity },
]

/** Map a puzzle rating to one of RATING_BANDS' ids. */
export function getRatingBand(rating) {
  const band = RATING_BANDS.find(b => rating >= b.min && rating <= b.max)
  return band ? band.id : RATING_BANDS[0].id
}

const defaults = {
  streak: 0,
  totalSolved: 0,
  // Move-level accuracy: every legal move the player attempts (correct or
  // wrong) is tallied here. Hint reveals are not counted as attempts.
  correctMoves: 0,
  wrongMoves: 0,
  // Solve counts broken down by rating band id / theme id.
  solvedByRating: {},
  solvedByTheme: {},
  // Map of "YYYY-MM-DD" -> true for days the daily puzzle has been solved.
  dailyCompleted: {},
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

/**
 * Persisted puzzle stats (streak, total solved, move accuracy, and
 * breakdowns by rating band / theme, plus daily-puzzle completion).
 * Stored under the 'cpg-stats' localStorage key, separate from
 * 'cpg-settings'.
 */
export function useStats() {
  const [stats, setStats] = useState(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
    } catch {
      // ignore (e.g. private browsing storage errors)
    }
  }, [stats])

  const setStreak = (updater) =>
    setStats(s => ({ ...s, streak: typeof updater === 'function' ? updater(s.streak) : updater }))

  const setTotalSolved = (updater) =>
    setStats(s => ({ ...s, totalSolved: typeof updater === 'function' ? updater(s.totalSolved) : updater }))

  /** Record one player move attempt as correct or wrong (for accuracy). */
  const recordMove = (isCorrect) =>
    setStats(s => ({
      ...s,
      correctMoves: s.correctMoves + (isCorrect ? 1 : 0),
      wrongMoves:   s.wrongMoves + (isCorrect ? 0 : 1),
    }))

  /** Record a fully-solved puzzle's rating band and themes. */
  const recordSolve = (puzzle) =>
    setStats(s => {
      const band = getRatingBand(puzzle.rating)
      const solvedByRating = { ...s.solvedByRating, [band]: (s.solvedByRating[band] || 0) + 1 }
      const solvedByTheme = { ...s.solvedByTheme }
      for (const t of puzzle.themes || []) {
        solvedByTheme[t] = (solvedByTheme[t] || 0) + 1
      }
      return { ...s, solvedByRating, solvedByTheme }
    })

  /** Mark the daily puzzle for a given date ("YYYY-MM-DD") as completed. */
  const markDailyCompleted = (dateStr) =>
    setStats(s => ({ ...s, dailyCompleted: { ...s.dailyCompleted, [dateStr]: true } }))

  /** Reset all stats back to zero, both in state and in localStorage. */
  const resetStats = () => {
    setStats(defaults)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
    } catch {
      // ignore
    }
  }

  const totalMoves = stats.correctMoves + stats.wrongMoves
  const accuracy = totalMoves > 0 ? Math.round((stats.correctMoves / totalMoves) * 100) : null

  return {
    streak: stats.streak,
    totalSolved: stats.totalSolved,
    correctMoves: stats.correctMoves,
    wrongMoves: stats.wrongMoves,
    accuracy,
    solvedByRating: stats.solvedByRating,
    solvedByTheme: stats.solvedByTheme,
    dailyCompleted: stats.dailyCompleted,
    setStreak,
    setTotalSolved,
    recordMove,
    recordSolve,
    markDailyCompleted,
    resetStats,
  }
}
