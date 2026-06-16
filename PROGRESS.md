# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`).

## Status
- Tier 1, 2, and 3 features all done (see FEATURES.md "Done" section).
- All Tier 3 items shipped: puzzle set expanded to ~27k, Puzzle Rush timed
  mode, local leaderboard, reliability hardening, explain modal, three-strike
  rule, full-screen menu, board-sizing rewrite, PWA fixes.
- Shareable results deferred to Tier 4 (better paired with multiplayer accounts).
- Tier 4 (multiplayer) is brainstorm-only for now — see FEATURES.md.
- Mobile header consolidation + confetti fixes done, committed, pushed
  (commit `db9d88a`, 2026-06-12).
- **2026-06-12 — mobile mockup fixes + desktop/PWA debug, NOT YET COMMITTED.**
  Implemented all 4 items from the user's mobile-screenshot requirements
  list (mobile fit, Explain button, 3-strike logic, full-screen menu). This
  also supersedes/replaces some of the *previous* session's uncommitted
  work (the CSS-`zoom` scale-to-fit hack and the post-solve-explanation
  toggle are both gone, replaced by better implementations below). Adaptive
  difficulty from the previous session is unchanged and kept.
  Same day, a follow-up session fixed two more bugs (desktop "ghost button"
  overlap behind the board, and a "way messed up" installed PWA) — see
  "Session 2" below. **None of this is committed yet, and the session 2
  fixes have not been verified live** (no live browser access was available;
  fixes are code-analysis only). Next chat should start by testing both
  rounds of changes per the checklists below, then commit/push.

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

## Session 3 (2026-06-12) — board-sizing rewritten from scratch, NOT YET COMMITTED
User tested live (Session 2's fix): Explain button works great, but ranks 1
and 8 are both chopped off — board rendered taller than `.board-wrap`,
centered + clipped by `overflow: hidden`, so the crop is symmetric top/bottom.
PWA also still "screwey" (not yet narrowed down further — see below).

First attempt this session was a `[boardWidth]`-deps effect that shrank the
board if `.app` overflowed. **That was wrong and user reported it didn't
help**: `.board-wrap` is `flex: 1 1 0; min-height: 0` with `overflow:
hidden`, so its box size is fixed by the flex layout and does **not** grow to
fit an oversized Chessboard child — `.app` never overflows even when the
board is visibly clipped *inside* `.board-wrap`. Checking `.app`'s overflow
could never detect this. Reverted that approach.

### Real fix — measure `.board-wrap` directly, always
- `src/App.jsx`: board-sizing effect rewritten again, this time to just
  measure `boardWrapRef.current.getBoundingClientRect()` (width AND height)
  and set `boardWidth = max(MIN_BOARD, floor(min(width, height)))`. This is
  the *ground truth* — `.board-wrap`'s box size is determined entirely by the
  flex layout around it (independent of `boardWidth`), so there's nothing to
  estimate or get out of sync.
  - `MIN_BOARD = 160` is now a module-level constant (was local to the old
    effect).
  - Unlike the very first version of this effect (pre-session-2), there is
    **no `size > 0` skip-guard** — `setBoardWidth` is always called, clamped
    to `MIN_BOARD`. Combined with the CSS floor below, the rect can never
    legitimately be 0, so this can't get "stuck" the way the original
    "ghost buttons" bug happened.
  - `ResizeObserver` now observes `.board-wrap` itself (not `.app`) — it
    fires whenever `.board-wrap`'s box changes for *any* reason (sibling
    height changes from badge-wrapping, window resize, font reflow, etc.),
    so the measurement is continuously re-validated against reality instead
    of being computed once from an estimate.
- `src/App.css`: `.board-wrap` gets `min-height: 160px` (matches
  `MIN_BOARD`) so its rect can never collapse to 0 and fully hide the board.
- Net effect: removed ~70 lines of height-budget/subtraction math and the
  scrollHeight-overflow safety-net effect; replaced with one small effect
  that measures the one element that actually matters.

### PWA "screwey" — not yet diagnosed
User said the installed/PWA view is "still screwey" but didn't specify how.
Likely candidates, **not yet investigated**:
- If they're testing the installed PWA, it's running whatever was last
  *built* (`npm run build`), which doesn't include ANY of this session's (or
  session 1/2's) source changes yet — only `npm run dev` reflects current
  source. Worth confirming what the user is actually looking at (dev server
  tab vs. installed PWA vs. a deployed URL) before chasing PWA-specific bugs.
- `vite.config.js` has `build: { emptyOutDir: false }` — old hashed
  JS/CSS chunks from previous builds are never removed from the output dir.
  Shouldn't normally cause staleness (index.html always points at the new
  hashes) but worth keeping in mind if the PWA serves something unexpected.
- SW (`public/sw.js`) already calls `skipWaiting()` + `clients.claim()` and
  is on `puzzle-gauntlet-v3`, so it should take over on next load without a
  manual unregister — if it's still not updating, check
  devtools → Application → Service Workers on the actual PWA.

### Not yet tested live
Chrome extension was not reachable this session (could not get a live
browser check). **Please test in a normal browser tab first** (simplest
case): confirm ranks 1 and 8 are fully visible at various window sizes
(including the short/narrow case from session 2's "ghost buttons" bug), then
report back exactly what's still wrong with the PWA (screenshot + what device/
how it's installed) so that can be investigated specifically next.

## Session 4 (2026-06-12) — actual root cause of ranks 1/8 cropping found
User tested `npm run dev` on `localhost:5173` (screenshot): ranks 1 and 8
*still* chopped, identical symmetric crop, even with session 3's
direct-`.board-wrap`-measurement rewrite. The measurement logic itself was
fine — the effect was simply **never running**.

### Root cause: `boardWrapRef.current` is `null` when the sizing effect first runs
- `App.jsx` has an early-return loading screen:
  `if (!game || !puzzle) return <div className="app-loading">...`. On the
  very first render, `game`/`puzzle` are both `null` (puzzles load
  asynchronously), so **`.board-wrap` doesn't exist in the DOM yet**.
- The board-sizing `useEffect(..., [])` runs once after that first render,
  reads `boardWrapRef.current` → `null`, hits `if (!wrapEl) return`, and exits
  *immediately* — no `updateSize()`, no `ResizeObserver`, no resize/
  orientation/visualViewport/fonts listeners ever get attached.
- Once puzzles finish loading, the component re-renders with the real
  `.app`/`.board-wrap` markup and `boardWrapRef.current` becomes non-null —
  but the effect has empty deps, so it never runs again.
- Net result: `boardWidth` stays at its `useState(480)` initial value
  forever, completely disconnected from `.board-wrap`'s actual rendered size.
  On this user's window, `.board-wrap`'s real height is less than 480px, so
  the 480×480 board overflows `.board-wrap` and gets centered + clipped by
  `overflow: hidden` — symmetric top/bottom crop = ranks 1 and 8 chopped.
  This explains why session 2's and session 3's *measurement logic* changes
  never visibly helped: the effect computing that logic was dead code after
  the first render.

### Fix — callback ref so the effect re-runs once `.board-wrap` mounts
- `src/App.jsx`:
  - Added `const [boardWrapMounted, setBoardWrapMounted] = useState(false)`
    and `const setBoardWrapNode = useCallback((node) => { boardWrapRef.current
    = node; setBoardWrapMounted(!!node) }, [])`.
  - `.board-wrap`'s `ref={boardWrapRef}` → `ref={setBoardWrapNode}`.
    `boardWrapRef.current` is still populated (used elsewhere by
    `fireConfettiFromElement`), but now setting it also flips
    `boardWrapMounted` to `true`.
  - Board-sizing effect's dependency array `[]` → `[boardWrapMounted]`, so it
    re-runs (and this time finds a real DOM node) the moment `.board-wrap`
    mounts after the loading screen goes away.
- No changes needed to the measurement logic itself (session 3's
  `getBoundingClientRect()`-based `updateSize()` is correct) — this was
  purely a "the effect never fires" bug.

### Not yet tested live
This should fix ranks 1/8 cropping on `localhost:5173` — **please refresh and
re-check** (hard refresh, since dev server should pick up the change via HMR
but a full reload rules out any stale-module weirdness). If it's fixed there,
the same fix should also resolve the deployed Vercel cropping and likely
contributes to the "PWA screwey" reports (a permanently-wrong `boardWidth`
would affect the installed PWA too) — but PWA-specific behavior still needs
its own test pass after this lands (uninstall/reinstall to pick up SW v3 +
prod-only registration from session 2).

## Session 5 (2026-06-16) — reliability hardening, NOT YET COMMITTED
All previous sessions' changes are now assumed committed and live on Vercel.
This session focused on making the codebase more robust before adding new features.

### Changes made
1. **Deleted `src/useFitToScreen.js`** — dead code since session 1's mobile rework.
2. **Removed all `explainText`/`setExplainText` dead state** from `App.jsx` — replaced
   by the step-through explain modal in the previous session but never cleaned up.
3. **Error boundary** added to `src/main.jsx` — wraps `<App />` in an `ErrorBoundary`
   class component. If any render throws (e.g. bad FEN, corrupted state), the app
   shows a friendly "Something went wrong — Reload app" screen instead of a white page.
4. **Puzzle data validation** in `src/data/puzzles.js` — `loadPuzzles()` now filters
   out any malformed puzzle objects (missing id/fen/moves/rating/themes, wrong types,
   empty moves array). Logs a warning with the count of dropped puzzles. Throws if the
   entire array is empty or not an array.
5. **Defensive try/catch in `buildExplainSteps`** (`src/data/explanations.js`) — the
   public function now wraps the internal `_buildSteps` logic in a try/catch, returning
   `[]` on any error. Individual `chess.move()` calls also wrapped so one bad UCI string
   skips that step rather than aborting the whole explain sequence.
6. **Split `timerRef` into three named refs** (`src/App.jsx`):
   - `computerTimerRef` — delay before the computer plays its reply after a correct move
   - `autoSolveTimerRef` — three-strike auto-solve delay
   - `replayTimerRef` — replay / explain step-through delays
   Each clear site now only cancels the appropriate timer, eliminating the possibility
   of one timer accidentally canceling an unrelated pending action.

### Commit commands
```
git add -A
git commit -m "Reliability hardening: error boundary, puzzle validation, explain try/catch, named timer refs, dead code removal"
git push
```

## Session 6 (2026-06-16) — new features, NOT YET COMMITTED

### Changes made
1. **`scripts/generate-puzzles.mjs`** — new Node.js script to regenerate
   `public/puzzles.json` from `lichess_db_puzzle.csv`. Streams the CSV
   (never loads the full 1.1GB), filters by rating 500–2500 / RD < 75 /
   NbPlays > 50, samples ~27,000 puzzles in a balanced distribution across
   6 rating bands, Fisher-Yates shuffles the output, writes to
   `public/puzzles.json`. Run with: `node scripts/generate-puzzles.mjs`
   (takes 3–8 min). Commit only `public/puzzles.json` afterward.

2. **`src/PuzzleRush.jsx`** — new self-contained Puzzle Rush component.
   Full-screen overlay (z-index 300, above everything). Phases: start
   screen (pick 3 or 5 min, shows best score) → playing (HUD with live
   countdown + score, board, 3-wrong-skip rule, "Give up" button) →
   results screen (score, new-best celebration, top-10 leaderboard).
   Board sizing uses the same ResizeObserver approach as the main app.

3. **`src/useStats.js`** — added `rushBestScore`, `rushLeaderboard`
   (top-10 array of `{score, durationSeconds, date}`), `addRushScore`
   (inserts entry, keeps top 10 sorted, updates best). All persisted in
   the existing `cpg-stats` localStorage key.

4. **`src/App.jsx`** — wired PuzzleRush: imported component, pulled new
   stats fields, added `rushOpen` state, added "⚡ Puzzle Rush" menu item
   (with best-score badge), added `<PuzzleRush>` overlay render, added
   inline leaderboard to the Stats panel.

5. **`src/App.css`** — added all Puzzle Rush and leaderboard CSS.

6. **`FEATURES.md`** / **`PROGRESS.md`** updated.

### Commit commands (includes session 5 hardening + session 6 features)
```
git add -A
git commit -m "Puzzle Rush timed mode, local leaderboard, puzzle gen script, reliability hardening"
git push
```

### Puzzle set already expanded
`node scripts/generate-puzzles.mjs` was run this session — `public/puzzles.json`
is now ~27k puzzles. Include it in the commit above (already staged via `git add -A`).

## Next steps
1. Commit + push (command above) if not already done.
2. Test Puzzle Rush: launch from ☰ menu, pick 3 min, solve a few, verify
   score ticks, timer goes red at 30s, results + leaderboard appear.
3. Stretch ideas for next session: Puzzle Rush achievements, multiplayer (Tier 4).

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
