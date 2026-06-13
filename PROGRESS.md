# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`).

## Status
- Tier 1 & 2 features done (see FEATURES.md "Done" section).
- Tier 3: Achievements/badges done (commit `6a53d42`). Adaptive difficulty
  done. Post-solve explanation toggle was replaced this session by an
  "Explain" button (see below — no longer Tier 3, it's its own item now).
  Remaining Tier 3 items (expand puzzle set, Puzzle Rush, leaderboard,
  shareable results) not started — see FEATURES.md.
- Mobile header consolidation + confetti fixes done, committed, pushed
  (commit `db9d88a`, 2026-06-12).
- **This session (2026-06-12) — mobile mockup fixes, NOT YET COMMITTED.**
  Implemented all 4 items from the user's mobile-screenshot requirements
  list (mobile fit, Explain button, 3-strike logic, full-screen menu). This
  also supersedes/replaces some of the *previous* session's uncommitted
  work (the CSS-`zoom` scale-to-fit hack and the post-solve-explanation
  toggle are both gone, replaced by better implementations below). Adaptive
  difficulty from the previous session is unchanged and kept.

## Uncommitted changes (2026-06-12, this session)

### 1. Mobile fit-without-scroll (replaces previous zoom-based approach)
- `index.html`: viewport meta restored to
  `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`
  — pinch-zoom disabled again (the zoom-fit hack that needed it as an escape
  hatch is gone).
- `src/index.css`: `html, body` now `height: 100%; overflow: hidden`; `body`
  uses `height: 100dvh` (was `min-height`).
- `src/App.css`:
  - `.app`: added `height: 100dvh; overflow: hidden`.
  - `.board-wrap`: removed `aspect-ratio: 1/1`; now `flex: 1 1 0; min-height: 0`
    so it consumes exactly the leftover vertical space after header/info/
    controls/feedback/footer.
- `src/App.jsx`:
  - Removed `import { useFitToScreen } from './useFitToScreen'` and its usage
    (`appRef` is still used, just for nothing zoom-related anymore).
  - Board-sizing `useEffect` rewritten: measures `.board-wrap`'s
    `getBoundingClientRect()` via `ResizeObserver` and sets
    `boardWidth = Math.floor(Math.min(width, height))` — fits both axes, no
    zoom math.
- **`src/useFitToScreen.js` is now dead code** (unused, not deleted — left in
  place; safe to delete in a future cleanup pass).
- Not yet tested on a real phone — verify no scrollbar appears and the board
  fills `.board-wrap` on a narrow screen.

### 2. "Explain" button (replaces the post-solve explanation toggle)
- `src/useSettings.js`: removed `showExplanations: false` default (toggle is
  gone entirely).
- `src/App.jsx`:
  - New state: `explainText`, `replaying`, plus `explainTimerRef`.
  - New `handleExplain` callback: replays the puzzle's full move sequence on
    the board (highlighting each move), then sets `explainText` from
    `getExplanation(puzzle)` and restores the previous status/msg/wrongFen.
  - New "📖 Explain" button added to `.control-row`, next to Undo/Hint
    (`disabled={!canExplain}`, where `canExplain = !!puzzle && !replaying &&
    status !== 'thinking'`).
  - Feedback area now renders `{explainText && <p className="feedback-explanation">{explainText}</p>}`
    instead of the old `isSolved && settings.showExplanations` block.
  - Removed the "Post-solve explanation" checkbox from Settings.
  - `handleUndo`/`handleHint`/`attemptMove`/`onSquareClick` all gained
    `!replaying` guards so nothing can be touched mid-replay.

### 3. Three-strike logic + streak reset
- New state: `wrongAttempts` (consecutive wrong tries on current puzzle),
  reset to 0 in `loadPuzzle`, `commitCorrectMove`, and `handleUndo`.
- `attemptMove`'s wrong-move branch increments `wrongAttempts`; on the 3rd
  consecutive miss it sets a message and schedules `autoSolveRef.current?.()`
  via `timerRef` (900ms delay).
- New `autoSolve` callback (placed after `handleUndo`, ref-assigned via
  `autoSolveRef.current = autoSolve`): resets `streak` to 0, then replays the
  remaining solution moves one-by-one (amber highlights), and once done sets
  `status = 'solved'` and auto-advances via `goNextRef.current?.()` after
  1.8s.
- Any new player action (`attemptMove`, `handleHint`) clears a pending
  auto-solve timer first, so taking a hint/undo before the 3rd-strike timer
  fires cancels the auto-reveal.

### 4. Full-screen menu overhaul + consolidated stats
- Header: removed the "✅ {totalSolved} solved" stat box — header now only
  shows "🔥 {streak} streak" + the ☰ menu button.
- New `puzzle-info` badge: `✅ {totalSolved}` added next to the rating badge
  (the "puzzle count ticker" moved here from the header, per requirement).
- Menu state simplified to `menuOpen` (bool) + `activePanel`
  (`null | 'stats' | 'achievements' | 'settings'`). Removed the old
  `settingsOpen`/`achievementsOpen`/`menuRef`/outside-click-to-close effect.
- New `.menu-overlay` (`position: fixed; inset: 0; z-index: 200`) — a
  full-screen overlay that completely covers the board and background when
  `menuOpen` is true. Contains:
  - top-level `.menu-list` (Today's Puzzle, Stats w/ `{totalSolved}` badge,
    Achievements w/ x/y badge, Settings) when `activePanel === null`
  - the **Stats** panel (moved out of Settings: Accuracy/Total solved/
    Streak rows, breakdown toggle, Reset Stats button) when
    `activePanel === 'stats'`
  - the **Achievements** badge grid when `activePanel === 'achievements'`
  - the **Settings** panel (shake/sound/board theme/difficulty range +
    adaptive difficulty/theme grid/shortcuts hint — Stats section and
    post-solve-explanation row both removed) when `activePanel === 'settings'`
  - header row with title + back (←, only when a panel is active) + close (✕)
- Closing the menu (`setMenuOpen(false)` + `setActivePanel(null)`) doesn't
  touch any game/puzzle state, so the board returns exactly to how it was —
  "seamless reset" is automatic since the overlay never modified game state.
- Escape key behavior unchanged: closes the active panel first, then the menu
  (existing keyboard effect already handled this).
- `src/App.css`: removed `.menu-wrap`/`.menu-dropdown`; added
  `.menu-overlay`/`.menu-overlay-header`/`.menu-overlay-actions`/`.menu-list`
  (`.menu-item*`/`.menu-dot` reused as-is); added `.solved-badge`; removed
  `margin-left: auto` from `.rating-badge` and moved it to `.solved-badge`
  (now the last badge in `.puzzle-info`).
- `.settings-panel-header` CSS class is now unused dead CSS (harmless,
  left in place).

## New gotcha discovered this session
- Sandbox `npx vite build` failed on `index.html` with a parse5 EOF error —
  confirmed via `Read` + `cat -A` that the **real file is complete and
  correct** (25 lines, properly closed `</html>`), but the sandbox bash mount
  serves a truncated copy (cuts off mid-attribute at byte 1223 of a ~1223+
  byte file). This is the same stale-mount issue as last session, now
  affecting `index.html` too. **Don't trust sandbox build failures** — verify
  the real file via `Read`/`cat -A` first.
- Same stale-mount issue also hit `src/App.jsx` (sandbox mount stuck at 905
  lines / 35011 bytes vs the real 1134-line file). Rewrote `index.html` in
  the sandbox via a heredoc to unblock `npm run build` there, but did **not**
  attempt the same for `App.jsx` (too large/risky to retype by hand) — all
  `App.jsx` edits this session were done via the `Edit` tool against the real
  file directly, unverified by a sandbox build. Double-check
  `npm run build`/`npm run dev` locally after pulling.

## Session 2 (2026-06-12) — desktop overlap + PWA debug, NOT YET COMMITTED
On top of session 1's uncommitted mobile-fit work above. User reported (with
a screenshot of the desktop app): the Undo/Hint/Explain control row renders
as a faded "ghost" overlay behind/on top of the bottom of the chessboard, and
separately that the installed PWA was "way messed up" (board chopped off,
scaling off, pieces draggable anywhere while dragging).

### Root cause 1 — board-sizing effect could get stuck at a stale size
- `src/App.jsx`: the board-sizing `useEffect` measured `.board-wrap`'s own
  `getBoundingClientRect()` for both width AND height. `.board-wrap` is
  `flex: 1 1 0; min-height: 0` — when the other items (header, puzzle-info,
  control-row, feedback-area, footer) don't all fit within `.app`'s height,
  board-wrap's box can be squeezed to ~0px. The old code's `size > 0` guard
  then *skipped* `setBoardWidth` entirely, leaving `boardWidth` at whatever
  (often larger) value it last had. The Chessboard then rendered at that
  stale size, overflowed the collapsed `.board-wrap` box (which had no
  `overflow` rule), and — since `.control-row` etc. come later in the DOM —
  painted underneath/behind the oversized board, producing the "ghost
  buttons" look. The same stale/oversized board is the most likely cause of
  the PWA's "chopped off"/"scaling way off"/drag-misalignment symptoms too.
- **Fix**: rewrote the effect to compute the height budget as `.app`'s own
  height minus the natural heights of every *other* flex child (skipping
  `position: fixed` children like the achievement toast / menu overlay) and
  their gaps — independent of `.board-wrap`'s own (possibly collapsed) box.
  Width budget still comes from `.board-wrap`'s rect (cross-axis, not subject
  to the collapse). `boardWidth` is now clamped to a `MIN_BOARD = 160`
  floor and **always** set (never skipped). Added listeners for
  `visualViewport.resize` (PWA chrome/keyboard changes) and
  `document.fonts.ready` (late web-font reflow) in addition to
  `resize`/`orientationchange`/`ResizeObserver`.
- `src/App.css`: added `overflow: hidden` to `.board-wrap` as a containment
  safety net, so even a momentarily-wrong `boardWidth` (e.g. first paint)
  can't visually bleed into the controls/feedback area below.

### Root cause 2 — service worker caches dev modules, PWA runs stale code
- `src/main.jsx`: `serviceWorker.register()` was unconditional, including in
  `npm run dev`. The SW's stale-while-revalidate strategy then caches Vite's
  dev module files (`/src/App.jsx`, `/src/App.css`, etc.) — an installed PWA
  from an earlier dev session keeps serving those **old cached modules**
  (pre-mobile-fit-rework layout, old zoom-based scaling hack, old drag setup)
  even after the source changes, which is consistent with the PWA looking
  dramatically different/worse than a plain browser tab on the same code.
  **Fix**: only register the SW when `import.meta.env.PROD`.
- `public/sw.js`: bumped `CACHE_NAME` from `puzzle-gauntlet-v2` to
  `puzzle-gauntlet-v3` so any previously-installed PWA's old cache gets
  invalidated on next load of a production build.

### Not yet verified live
Could not get a live browser/device session this round (computer-use access
request to the user's machine timed out) — these fixes are based on careful
code-level analysis, not an observed-then-fixed loop. **Please test**:
- Desktop: resize the window short/narrow and confirm the control row no
  longer overlaps/ghosts behind the board at any size.
- PWA: uninstall/reinstall (or hard-refresh + unregister old SW via
  devtools → Application → Service Workers) so it picks up the
  prod-only-SW change, then re-test board sizing and drag behavior.

## Next steps
1. Test the session 2 fixes (see "Not yet verified live" above) — desktop
   resize behavior and PWA reinstall/board sizing/drag.
2. Commit + push everything (session 1 + session 2 changes, commands below).
3. Test on a real phone / Chrome device emulation:
   - No vertical scrollbar, board fills available space on a narrow screen.
   - Pinch-zoom is disabled (as intended).
   - Explain button replays the solution and shows the explanation text.
   - Trigger 3 wrong moves in a row on a puzzle → verify auto-solve replay,
     streak resets to 0, and it auto-advances to the next puzzle.
   - Open the ☰ menu → confirm it fully covers the board; check Stats,
     Achievements, and Settings panels (back/close buttons, breakdown
     toggle, Reset Stats); close the menu and confirm the board/puzzle state
     is unchanged.
4. Consider deleting the now-dead `src/useFitToScreen.js` in a cleanup pass.
5. Remaining Tier 3 ideas (puzzle set expansion, Puzzle Rush, leaderboard,
   shareable results) — pick up in a fresh chat, see FEATURES.md.

## Commit commands for this session's changes
```
git add -A
git commit -m "Mobile fit rework, Explain button, 3-strike auto-solve, full-screen menu overhaul, board-sizing/PWA fixes"
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
  this project** — previously caused a stale `.git/index.lock` that couldn't
  be removed from the sandbox. Read-only git commands (status, log, diff) are
  fine.
- Sandbox bash file mounts can be **stale/truncated** for recently-edited
  files (`index.html`, `App.jsx` both affected so far) — always verify via
  `Read`/`cat -A` before trusting a sandbox build error.
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
