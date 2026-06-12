/**
 * Achievement / badge definitions.
 *
 * Each achievement's `check(summary)` receives a small summary object
 * derived from useStats:
 *   {
 *     totalSolved,     // number
 *     maxStreak,       // number — best streak ever reached
 *     accuracy,        // number 0-100 or null if no moves yet
 *     totalMoves,      // number — correctMoves + wrongMoves
 *     solvedByRating,  // { [ratingBandId]: count }
 *     solvedByTheme,   // { [themeId]: count }
 *     dailyCompleted,  // { [dateStr]: true }
 *   }
 *
 * `check` must be a pure function of the summary and should return a
 * boolean. Achievements are permanent once unlocked — re-checking an
 * already-unlocked achievement is skipped by useStats.
 */

import { RATING_BANDS } from './ratingBands'

export const achievements = [
  // ── Solve milestones ──────────────────────────────────────────────
  {
    id: 'first-solve',
    icon: '🎉',
    name: 'First Blood',
    description: 'Solve your first puzzle',
    check: (s) => s.totalSolved >= 1,
  },
  {
    id: 'solve-10',
    icon: '🥉',
    name: 'Getting Started',
    description: 'Solve 10 puzzles',
    check: (s) => s.totalSolved >= 10,
  },
  {
    id: 'solve-50',
    icon: '🥈',
    name: 'Puzzle Enthusiast',
    description: 'Solve 50 puzzles',
    check: (s) => s.totalSolved >= 50,
  },
  {
    id: 'solve-100',
    icon: '🥇',
    name: 'Puzzle Master',
    description: 'Solve 100 puzzles',
    check: (s) => s.totalSolved >= 100,
  },
  {
    id: 'solve-500',
    icon: '🏆',
    name: 'Puzzle Legend',
    description: 'Solve 500 puzzles',
    check: (s) => s.totalSolved >= 500,
  },

  // ── Streaks ───────────────────────────────────────────────────────
  {
    id: 'streak-5',
    icon: '🔥',
    name: 'Warming Up',
    description: 'Reach a streak of 5',
    check: (s) => s.maxStreak >= 5,
  },
  {
    id: 'streak-10',
    icon: '🔥',
    name: 'On Fire',
    description: 'Reach a streak of 10',
    check: (s) => s.maxStreak >= 10,
  },
  {
    id: 'streak-25',
    icon: '🔥',
    name: 'Unstoppable',
    description: 'Reach a streak of 25',
    check: (s) => s.maxStreak >= 25,
  },

  // ── Accuracy ──────────────────────────────────────────────────────
  {
    id: 'accuracy-90',
    icon: '🎯',
    name: 'Sharpshooter',
    description: 'Reach 90% move accuracy (50+ moves played)',
    check: (s) => s.totalMoves >= 50 && s.accuracy !== null && s.accuracy >= 90,
  },

  // ── Breadth / coverage ────────────────────────────────────────────
  {
    id: 'rating-spread',
    icon: '📊',
    name: 'Across the Board',
    description: 'Solve a puzzle in every difficulty band',
    check: (s) => RATING_BANDS.every(b => (s.solvedByRating[b.id] || 0) > 0),
  },
  {
    id: 'theme-explorer',
    icon: '🧭',
    name: 'Theme Explorer',
    description: 'Solve puzzles from 10 different themes',
    check: (s) => Object.values(s.solvedByTheme).filter(c => c > 0).length >= 10,
  },

  // ── Theme specialists ─────────────────────────────────────────────
  {
    id: 'mate-hunter',
    icon: '♚',
    name: 'Mate Hunter',
    description: 'Solve 10 checkmate puzzles',
    check: (s) => (s.solvedByTheme.mate || 0) >= 10,
  },
  {
    id: 'fork-master',
    icon: '🍴',
    name: 'Fork Master',
    description: 'Solve 10 fork puzzles',
    check: (s) => (s.solvedByTheme.fork || 0) >= 10,
  },
  {
    id: 'pin-expert',
    icon: '📌',
    name: 'Pin Expert',
    description: 'Solve 10 pin puzzles',
    check: (s) => (s.solvedByTheme.pin || 0) >= 10,
  },
  {
    id: 'sacrifice-specialist',
    icon: '💣',
    name: 'Sacrifice Specialist',
    description: 'Solve 10 sacrifice puzzles',
    check: (s) => (s.solvedByTheme.sacrifice || 0) >= 10,
  },
  {
    id: 'endgame-expert',
    icon: '⏳',
    name: 'Endgame Expert',
    description: 'Solve 10 endgame puzzles',
    check: (s) => (s.solvedByTheme.endgame || 0) >= 10,
  },

  // ── Daily puzzle ──────────────────────────────────────────────────
  {
    id: 'daily-7',
    icon: '📅',
    name: 'Daily Devotee',
    description: 'Complete 7 daily puzzles',
    check: (s) => Object.keys(s.dailyCompleted).length >= 7,
  },
  {
    id: 'daily-30',
    icon: '🗓️',
    name: 'Calendar Crusher',
    description: 'Complete 30 daily puzzles',
    check: (s) => Object.keys(s.dailyCompleted).length >= 30,
  },
]
