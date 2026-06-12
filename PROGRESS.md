# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`).

## Status
- Tier 1 & 2 features done (see FEATURES.md "Done" section).
- Tier 3: Achievements/badges done (2026-06-12, uncommitted — see below).
  Remaining Tier 3 items not started.
- Commit `2c97355` "Clarify move instructions and add label to daily puzzle
  button" is committed and pushed (branch was "up to date with origin/main"
  as of 2026-06-12). Also added CLAUDE.md, PROGRESS.md, .claudeignore for the
  new session-handoff workflow (CLAUDE.md was still untracked as of
  2026-06-12 — add/commit it next session if not already done).

## Pending changes (uncommitted, 2026-06-12)
Achievements/badges feature — 17 badges (solve milestones, streaks, accuracy,
rating-band coverage, theme specialists, daily completion). New files:
- `src/data/achievements.js` — badge definitions + `check(summary)` fns
- `src/data/ratingBands.js` — RATING_BANDS/getRatingBand (extracted from
  useStats.js to avoid a circular import with achievements.js)

Modified files:
- `src/useStats.js` — rewritten: tracks `maxStreak`, `unlockedAchievements`,
  `newlyUnlocked` toast queue; re-exports RATING_BANDS/getRatingBand from the
  new ratingBands.js for backward compat.
- `src/sounds.js` — added `playAchievement()` chime.
- `src/App.jsx` — added achievements header button (🏆 with x/y count),
  achievements panel (badge grid), and toast+confetti+chime on unlock.
- `src/App.css` — added `.achievements-stat/.achievements-btn/.achievements-count`,
  `.badge-grid/.badge-card/.badge-icon/.badge-info`, `.achievement-toast` +
  keyframes, plus mobile breakpoint tweaks.

Verification: build could not be run via sandbox bash (stale mount of
App.jsx — showed old 814-line version regardless of edits). Verified
correctness via full manual Read of App.jsx (906 lines, balanced JSX/braces,
correct structure end-to-end). **Next session: run `npm run build` /
`npm run dev` locally to confirm, then commit + push.**

## Known gotchas
- User runs commands in **PowerShell 5.1** — `&&` is NOT a valid statement
  separator. Use `;` or separate lines, e.g.:
  ```
  git add -A
  git commit -m "message"
  git push
  ```
- The sandbox shell (mcp__workspace__bash) has no GitHub credentials, so `git
  push` must be run by the user in their own terminal, not from here.
- **Don't run `git reset`/index-modifying commands from the sandbox bash on
  this project** — on 2026-06-12 a `git reset HEAD -- <path>` left a stale
  `.git/index.lock` that couldn't be removed from the sandbox (permission
  error on this mount) and produced a phantom `vite.config.js -> v` rename in
  `git status`. The real commit/push had already succeeded beforehand. If you
  see this again, ask the user to run in PowerShell:
  ```
  Remove-Item ".git\index.lock" -ErrorAction SilentlyContinue
  git status
  ```
  Read-only git commands (status, log, diff) from the sandbox are fine.
- `lichess_db_puzzle.csv` (1.1GB) is the raw source data used to generate
  `public/puzzles.json` — already gitignored, see `.claudeignore`.

## Workflow going forward
- User is splitting work into separate task-chats to avoid hitting context
  limits / compaction. Update this file after making changes so a fresh chat
  has the current picture.
- See `.claudeignore` for files that should generally be skipped when
  exploring the project.
- "NEW CHAT" trigger: update PROGRESS.md + FEATURES.md always; .claudeignore /
  CLAUDE.md only if something workflow-relevant changed (see CLAUDE.md).
