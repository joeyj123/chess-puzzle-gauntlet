# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`).

## Status
- Tier 1 & 2 features done (see FEATURES.md "Done" section).
- Tier 3: Achievements/badges done and pushed (commit `6a53d42`, 2026-06-12).
  Remaining Tier 3 items not started.
- CLAUDE.md is now tracked (added in `6a53d42`).
- Mobile header consolidation + confetti centering fixes done 2026-06-12,
  NOT YET committed/pushed (see "Last completed feature" below — give user
  the commit/push commands).

## Last completed feature (2026-06-12, uncommitted)
Mobile header cleanup + confetti/achievement fixes, addressing: cramped
mobile header (daily/achievements/settings buttons), confetti firing on app
open, and confetti bursting off-center.

New files:
- `src/confetti.js` — `fireConfettiFromElement(el, options)`. Uses its own
  full-viewport canvas (`confetti.create` with `position:fixed; inset:0`)
  instead of canvas-confetti's default canvas (which sizes itself from
  `document.documentElement.clientWidth/Height` and can drift off-center).
  Origin x/y is computed from the target element's `getBoundingClientRect()`
  relative to `window.innerWidth/innerHeight`.

Modified files:
- `src/App.jsx`:
  - Header now shows streak + solved stats and a single ☰ menu button
    (`.menu-wrap`/`.menu-btn`/`.menu-dropdown`/`.menu-item`). The dropdown
    has 3 items: Today's Puzzle (daily toggle, ✓ badge when completed),
    Achievements (x/y badge), Settings. Replaces the separate daily/
    achievements/settings header buttons.
  - Opening achievements or settings from the menu closes the other (mutually
    exclusive panels). Menu closes on outside click/tap and Escape.
  - Solve confetti now anchors to `boardWrapRef`; achievement-toast confetti
    anchors to a new `toastRef` (fired via `requestAnimationFrame` so the
    toast has a rect to measure).
  - Replaced direct `canvas-confetti` import with `fireConfettiFromElement`
    from `./confetti`.
- `src/useStats.js` — achievement-check effect now skips the
  toast/confetti celebration on the very first run after mount (backfills
  `unlockedAchievements` silently for already-met achievements instead of
  popping confetti immediately on app open). Added `isFirstCheckRef`.
- `src/App.css` — removed `.settings-btn`, `.daily-stat/.daily-btn/
  .daily-check`, `.achievements-stat/.achievements-btn/.achievements-count`;
  added `.menu-wrap/.menu-btn/.menu-btn-icon/.menu-dot/.menu-dropdown/
  .menu-item*` and updated the `max-width: 480px` breakpoint accordingly.
  `.daily-badge` (used in the puzzle-info bar) kept as-is.

Note on "does it save per user": there's no account system — stats/
achievements persist via `localStorage` (`cpg-stats` key) per browser/device,
same as before. Not cross-device.

Note: build wasn't run via sandbox bash (stale mount issue, see gotchas) —
verified via full manual Read instead, same as the previous session.

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
