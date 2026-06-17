# Debug Log — Chess Puzzle Gauntlet

Bugs found and fixed. Newest at the top.

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
