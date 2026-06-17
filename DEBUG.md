# Debug Log — Chess Puzzle Gauntlet

Bugs found and fixed. Newest at the top.

---

## Session 12 — 2026-06-17

### Improvement: Stockfish depth capped at 12 for mobile performance
Previous depths of 14, 16, 18 for Expert/Candidate Master/Master could cause
long delays or dropped frames on mobile devices. All levels now cap at 12.
movetime reduced from 1500 → 800 ms — Stockfish stops at whichever fires first.
Stockfish already ran in a Web Worker (`new Worker('/stockfish.js')`) and
still does — the UI thread is never blocked.

### Fix: `classifyMove` thresholds updated + Mistake category removed
Old thresholds had a "Mistake" band (60–120 cp loss). New spec:
- 0–5 cp: Best (`!!`)
- 6–10 cp: Excellent (`!`)
- 11–40 cp: Good (`✓`)
- 41–100 cp: Inaccuracy (`?!`)
- 101+ cp: Blunder (`??`)
`CLASS_CONFIG` in `GameReview.jsx` updated to match.

### Feature: Anonymous authentication + game history
- `useAuth.js` — new hook; signs in anonymously on first load, exposes `linkGoogle()`.
- `supabase/schema.sql` — `profiles` + `game_history` tables with RLS, auto-profile trigger.
- `ComputerChess.jsx` — saves completed games to `game_history` (fire-and-forget).
- `App.jsx` Settings — "Link Google Account" button upgrades anon → persistent identity.

### Feature: Puzzle Rush — turn label + objective label
`onSquareClick` in PuzzleRush was already fixed (Session 11). This session adds
the `.rush-meta-bar` above the HUD showing the puzzle objective and active color.

### Feature: GameReview — dynamic move classification summaries
Each move badge now shows a one-sentence `getClassificationSummary` explanation
(e.g. "Blunder! This move loses 134 centipawns…") so the review is readable
without chess knowledge.

---

## Session 11 — 2026-06-17 (continued)

### Improvement: Computer move capped at 1.5 seconds
**Symptom:** Higher difficulty levels (depth 14–18) could take many seconds to
respond, making the game feel sluggish.

**Fix (`src/useStockfish.js`):**
- `getBestMove` now accepts an optional `movetime` parameter (default 1500 ms).
- The UCI `go` command is now `go depth N movetime M` — Stockfish stops at
  whichever limit is hit first. Low depths (1–5) still finish in milliseconds;
  higher depths are capped at ≤1.5 s.

**Fix (`src/ComputerChess.jsx`):**
- Passes `movetime: 1500` explicitly when calling `getBestMove`.

---

## Session 11 — 2026-06-17

### Bug: vs Computer stuck in "thinking" forever
**Symptom:** Selecting "Novice (750)" and starting a game left the status bar
permanently showing "Computer is thinking…" with no move ever being played.

**Root cause:** `getBestMove()` in `useStockfish.js` returned a `Promise` with
no timeout. If Stockfish's Web Worker failed to load (`/stockfish.js` missing
or blocked), the `bestmove` message never arrived and the promise never
resolved. `thinking` state stayed `true` indefinitely, blocking all interaction.

**Fix (`src/useStockfish.js`):**
- Added a 15-second `setTimeout` inside `getBestMove` that calls `resolve(null)`
  and clears `callbackRef` if no `bestmove` line arrives.
- Added a 20-second timeout in `analyzePosition` for the same reason.

**Fix (`src/ComputerChess.jsx`):**
- When `getBestMove` returns `null` (timeout/failure), instead of silently
  returning (leaving the game stuck), the code now picks a random legal move
  as a fallback so the game stays playable. Console logs a warning.

---

### Bug: Puzzle Rush only supports drag-and-drop, not click-to-move
**Symptom:** In Puzzle Rush mode, clicking a piece and then clicking a
destination square did nothing. Only dragging pieces worked.

**Root cause:** `onSquareClick` in `PuzzleRush.jsx` was a stub:
```js
if (isOwnPiece) return  // simple click-to-move not implemented in rush mode for simplicity
```
It returned early for own pieces and did nothing for destination squares.

**Fix (`src/PuzzleRush.jsx`):**
- Added `selectedSq` and `legalTargets` state.
- `onSquareClick` now implements the full select → legal dots → move flow:
  click own piece → highlight it + show legal move dots; click legal square →
  call `commitMove`; click another own piece → re-select; click elsewhere → deselect.
- `loadPuzzle` resets `selectedSq`/`legalTargets` on every new puzzle.
- `customSquareStyles` merged into a single computed object that combines the
  existing `highlights` (correct/wrong flash) with selection highlight and
  radial-gradient legal-move dots.

---

## Session 10 — 2026-06-16

### Bug: "Failed to set indexed property [0] on CSSStyleDeclaration"
**Root cause:** `customLightSquareStyle`/`customDarkSquareStyle` in LiveChess
and MultiplayerDuel were passed raw hex strings (`boardTheme.light = '#f0d9b5'`)
instead of style objects. Fixed to `{ backgroundColor: boardTheme.light }`.

### Bug: Moves not syncing in LiveChess / MultiplayerDuel
**Root cause:** Supabase JS v2 query builder is lazy — `.update().eq()` builds
the query but never sends it without `.then()` or `await`. All fire-and-forget
updates now have `.then(() => {})`.

### Bug: Turn/check indicator overlap
**Root cause:** Two separate DOM elements stacked when both were visible.
Merged into a single `.chess-status-bar` element.
