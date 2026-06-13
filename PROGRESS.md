# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`).

## Status
- Tier 1 & 2 features done (see FEATURES.md "Done" section).
- Tier 3: Achievements/badges done (commit `6a53d42`). Post-solve explanation
  toggle AND adaptive difficulty done this session (NOT YET COMMITTED — see
  below). Remaining Tier 3 items (expand puzzle set, Puzzle Rush, leaderboard,
  shareable results) not started — see FEATURES.md for implementation notes.
- CLAUDE.md is now tracked (added in `6a53d42`).
- Mobile header consolidation + confetti fixes done, committed, and pushed
  (commit `db9d88a`, 2026-06-12).
- Mobile scale-to-fit + viewport tweak + post-solve explanation + adaptive
  difficulty done this session (2026-06-12) — NOT YET COMMITTED, working
  tree has uncommitted changes (see "Uncommitted changes" below).

## Uncommitted changes (2026-06-12, this session)
1. **Mobile scale-to-fit + viewport tweak** — addresses "edges cut off, no
   way to zoom out" on phones.
   - `index.html`: viewport meta no longer sets `maximum-scale=1.0,
     user-scalable=no` — pinch-zoom is now available as a manual escape
     hatch. Kept `width=device-width, initial-scale=1.0, viewport-fit=cover`.
   - New `src/useFitToScreen.js`: `useFitToScreen(ref)` hook. On mount/
     resize/orientationchange, resets `zoom` to 1, measures
     `document.documentElement.scrollWidth` vs `window.innerWidth`, and if
     content overflows horizontally, sets `el.style.zoom` to shrink just
     enough to fit (clamped to a minimum of 0.7). No-ops on screens that
     already fit (desktop/tablet untouched).
   - `src/App.jsx`: added `appRef` ref + `useFitToScreen(appRef)`, attached
     `ref={appRef}` to the root `.app` div.
   - NOT YET TESTED IN AN ACTUAL BROWSER — sandbox bash build is broken (see
     gotchas below), so this was verified by manual code review only. User
     should test on a real phone (or Chrome device emulation) before
     trusting it, especially: (b) `zoom` behaves in current mobile Safari/
     Chrome, (c) pinch-zoom doesn't interfere with making moves on the
     board.
   - **Found + fixed during debug pass**: (a) board double-scaling. The
     board-sizing `ResizeObserver` effect measures `boardWrapRef` via
     `getBoundingClientRect()`, which returns the post-zoom *visual* size —
     but that value was being passed straight to `<Chessboard
     boardWidth={...}>` as a literal px, which would get scaled by `zoom`
     *again* inside the same zoomed `.app` subtree (board rendering ~20-30%
     smaller than its wrapper whenever `useFitToScreen` shrinks the page).
     Fixed by dividing the measured size by `getComputedStyle(appRef.current
     ).zoom` before calling `setBoardWidth`. Still not run in a real
     browser — verify the board now fills its wrapper on a narrow phone.

2. **Post-solve explanation toggle** (Tier 3 item, done).
   - New `src/data/explanations.js`: `getExplanation(puzzle)` — builds a
     1-2 sentence explanation from the puzzle's Lichess theme tags (mate-in-N
     + tactic type, e.g. fork/pin/skewer/etc.), with a generic fallback.
   - `src/useSettings.js`: added `showExplanations: false` default.
   - `src/App.jsx`: imports `getExplanation`; new Settings row "Post-solve
     explanation" checkbox; when solved and the setting is on, renders
     `<p className="feedback-explanation">{getExplanation(puzzle)}</p>`
     above the Next Puzzle button.
   - `src/App.css`: new `.feedback-explanation` style (small muted centered
     text).

3. **Adaptive difficulty toggle** (Tier 3 item, done).
   - `src/useSettings.js`: added `adaptiveDifficulty: false` default.
   - `src/App.jsx`: new `adaptiveOffsetRef` (a ref, not state) — after each
     solve, if `accuracy >= 85` adds +50, if `<= 55` adds -50, clamped to
     ±250. `goNext()` then, if the toggle is on and the offset is non-zero,
     searches the existing `queue` (forward from the normal "next" index,
     wrapping) for the puzzle whose rating is closest to
     `clamp(midpoint(ratingMin,ratingMax) + offset, ratingMin, ratingMax)`
     and loads that instead of always `queue[qIdx+1]`.
   - Deliberately does **not** touch `settings.ratingMin/ratingMax` or the
     queue-rebuild effect — doing so would trigger an immediate
     `loadPuzzle()` right when `totalSolved` increments (i.e. the instant a
     puzzle is solved), wiping out the "solved" success message/confetti
     before the user sees it. The ref + goNext approach avoids that
     entirely.
   - New Settings row "Adaptive difficulty" (off by default) with a
     one-line explanation of the behavior.
   - Same caveat as above: not run in a real browser, verified by code
     review only.

## New gotcha discovered this session
- The sandbox bash mount serves a **stale/cached copy** of edited files —
  after editing `index.html` and `src/App.jsx` via the file tools, the
  sandbox bash view showed trailing null-byte padding / truncated content
  that does NOT match the real files (confirmed correct via the Read tool,
  948 lines for App.jsx vs sandbox's stale 942). `npx vite build` in the
  sandbox fails on this stale copy — **this is a sandbox artifact, not a
  real bug in the files**. Don't trust sandbox build failures without first
  re-reading the file via the Read tool to confirm it matches what was
  written. `git checkout -- index.html` in the sandbox also failed
  ("Operation not permitted") — left as-is, harmless.

## Last completed feature (2026-06-12, commit `db9d88a`)
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
verified via full manual Read instead, same as the previous session. User
committed/pushed successfully (`db9d88a`), so treat as confirmed working
unless an issue surfaces.

## Next steps
- Test the scale-to-fit + viewport changes on a real phone, then commit/push
  (commands below).
- Remaining Tier 3 ideas (puzzle set expansion, adaptive difficulty, Puzzle
  Rush, leaderboard, shareable results) have implementation notes in
  FEATURES.md — pick one up in a fresh chat.
- If the user reports the confetti is still off-center or the mobile menu
  has issues, re-check `src/confetti.js` and the `.menu-*` styles in
  App.css/App.jsx added in `db9d88a`.

## Commit commands for this session's changes
```
git add -A
git commit -m "Mobile scale-to-fit + viewport tweak; post-solve explanation and adaptive difficulty toggles"
git push
```

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
