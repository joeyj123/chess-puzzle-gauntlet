import { useState, useEffect } from 'react'

const STORAGE_KEY = 'cpg-stats'

const defaults = {
  streak: 0,
  totalSolved: 0,
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
 * Persisted puzzle stats (current streak, total solved). Stored under the
 * 'cpg-stats' localStorage key, separate from 'cpg-settings'.
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

  /** Reset all stats back to zero, both in state and in localStorage. */
  const resetStats = () => {
    setStats(defaults)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
    } catch {
      // ignore
    }
  }

  return {
    streak: stats.streak,
    totalSolved: stats.totalSolved,
    setStreak,
    setTotalSolved,
    resetStats,
  }
}
