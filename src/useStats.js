import { useState, useEffect } from 'react'
import { RATING_BANDS, getRatingBand } from './data/ratingBands'
import { achievements } from './data/achievements'

export { RATING_BANDS, getRatingBand }

const STORAGE_KEY = 'cpg-stats'

const defaults = {
  streak: 0,
  // Best streak ever reached — used for streak-based achievements (the
  // current `streak` resets on a wrong/hint move, this doesn't).
  maxStreak: 0,
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
  // Ids of achievements/badges already unlocked (see ./data/achievements).
  unlockedAchievements: [],
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
 * Persisted puzzle stats (streak, total solved, move accuracy, breakdowns
 * by rating band / theme, daily-puzzle completion, and unlocked
 * achievements). Stored under the 'cpg-stats' localStorage key, separate
 * from 'cpg-settings'.
 */
export function useStats() {
  const [stats, setStats] = useState(load)
  // Transient queue of achievements unlocked this session that haven't
  // been shown/dismissed as a toast yet. Not persisted.
  const [newlyUnlocked, setNewlyUnlocked] = useState([])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
    } catch {
      // ignore (e.g. private browsing storage errors)
    }
  }, [stats])

  const setStreak = (updater) =>
    setStats(s => {
      const next = typeof updater === 'function' ? updater(s.streak) : updater
      return { ...s, streak: next, maxStreak: Math.max(s.maxStreak, next) }
    })

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
    setNewlyUnlocked([])
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
    } catch {
      // ignore
    }
  }

  /** Dismiss the oldest pending achievement toast. */
  const clearNewlyUnlocked = () => setNewlyUnlocked(q => q.slice(1))

  const totalMoves = stats.correctMoves + stats.wrongMoves
  const accuracy = totalMoves > 0 ? Math.round((stats.correctMoves / totalMoves) * 100) : null

  // ── Achievement detection ─────────────────────────────────────────────
  // Whenever the underlying stats change, check every not-yet-unlocked
  // achievement and persist + queue any that now pass.
  useEffect(() => {
    const summary = {
      totalSolved: stats.totalSolved,
      maxStreak: stats.maxStreak,
      accuracy,
      totalMoves,
      solvedByRating: stats.solvedByRating,
      solvedByTheme: stats.solvedByTheme,
      dailyCompleted: stats.dailyCompleted,
    }
    const newly = achievements.filter(
      a => !stats.unlockedAchievements.includes(a.id) && a.check(summary)
    )
    if (newly.length) {
      setStats(s => ({
        ...s,
        unlockedAchievements: [...s.unlockedAchievements, ...newly.map(a => a.id)],
      }))
      setNewlyUnlocked(q => [...q, ...newly])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stats.totalSolved,
    stats.maxStreak,
    stats.correctMoves,
    stats.wrongMoves,
    stats.solvedByRating,
    stats.solvedByTheme,
    stats.dailyCompleted,
  ])

  return {
    streak: stats.streak,
    maxStreak: stats.maxStreak,
    totalSolved: stats.totalSolved,
    correctMoves: stats.correctMoves,
    wrongMoves: stats.wrongMoves,
    accuracy,
    solvedByRating: stats.solvedByRating,
    solvedByTheme: stats.solvedByTheme,
    dailyCompleted: stats.dailyCompleted,
    unlockedAchievements: stats.unlockedAchievements,
    newlyUnlocked,
    clearNewlyUnlocked,
    setStreak,
    setTotalSolved,
    recordMove,
    recordSolve,
    markDailyCompleted,
    resetStats,
  }
}
