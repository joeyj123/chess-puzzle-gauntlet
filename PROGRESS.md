# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`). Live: chess-puzzle-gauntlet.vercel.app

## Status (Session 15, 2026-06-19)
Most Tier 1–4 features are shipped and deployed. Session 13 focused on auth setup,
Google sign-in across devices, and making vs-Computer moves near-instant.

**User completed Supabase + Vercel env setup:**
- Anonymous sign-in enabled, Google OAuth configured, manual linking enabled
- `schema.sql` + `fix-auth-trigger.sql` run successfully in SQL Editor
- `.env.local` created locally (gitignored) with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- Same two env vars added in Vercel → Settings → Environment Variables + redeploy

**Auth flow (important for new chats):**
- Each device/browser gets its own **guest** session on first visit
- **Link Google Account** = first-time attach Google to *this* guest (one device)
- **Sign in with Google** = use on other devices if Google already linked elsewhere
- `identity_already_exists` = Google already linked on another account (phone vs laptop)
- Sign-in must **sign out guest first** before OAuth (`signInWithGoogle` does this)
- Supabase Site URL: `https://chess-puzzle-gauntlet.vercel.app`
- Redirect URLs include live app + `http://localhost:5173/**`

## Latest code changes (Session 15 — verify pushed)

### Session 15 changes

1. **`src/useStockfish.js` + `src/GameReview.jsx`** — Game Review was taking
   several minutes (47-move game = 94 Stockfish searches, each an uncapped
   `go depth 10`).
   - `analyzePosition(fen, depth, movetime)` now takes a `movetime = 400`
     cap — UCI `go depth 10 movetime 400`, so Stockfish stops at whichever
     limit hits first instead of occasionally running long on complex
     middlegame positions.
   - `GameReview.jsx`'s analysis loop now evaluates each of the `total + 1`
     unique positions exactly once instead of twice (the old code separately
     scored "after move i" and "before move i+1", which are the same
     position) — half the searches for the same result. cpLoss/classification
     are then derived in a fast synchronous pass over the cached scores.
   - Net effect: roughly 4x fewer/faster searches. A 47-move game that took a
     few minutes should now land closer to 20-30 seconds.

2. **`src/ComputerChess.jsx`** — vs-Computer games now survive the tab/PWA
   being backgrounded or killed (e.g. swiping out to send a text, or the
   mobile browser reclaiming a hidden page under memory pressure).
   - Added `SESSION_KEY = 'cpg-computer-session'` + `loadSession()` /
     `saveSession()` localStorage helpers and an exported `hasSavedComputerGame()`.
   - A `useEffect` keyed on `[phase, game, result, diffIdx, playerColor, orientation]`
     writes a snapshot `{ phase, diffIdx, playerColor, humanColor, orientation,
     pgn: masterGameRef.current.pgn(), result, savedAt }` to localStorage after
     every move/phase change. Cheap, synchronous, no debounce needed.
   - On mount, `loadSession()` restores `phase`/`diffIdx`/`playerColor`/`orientation`/
     `result`/`humanColorRef`, and rebuilds the live `game` + `masterGameRef` by
     replaying the saved PGN (`new Chess(); g.loadPgn(pgn)`) — restoring is a
     synchronous localStorage read + PGN replay, so it's effectively instant.
   - If restored mid-game and it was the computer's turn (interrupted before its
     reply came back), a one-time mount effect calls `scheduleComputerMove` again
     so the game doesn't stall waiting for a reply that already happened (or didn't).
   - Storage is only cleared when `phase` returns to `'setup'` (i.e. the user
     explicitly starts a New Game from the results screen). Closing the overlay
     mid-game (✕ button) does **not** clear it — reopening vs-Computer, or a full
     app relaunch, drops the player back into the exact same position.

3. **`src/App.jsx`** — `computerOpen` now initializes via
   `useState(() => hasSavedComputerGame())` (imported from `ComputerChess.jsx`),
   so on load the app auto-reopens straight into a saved in-progress/just-finished
   vs-Computer game instead of showing the normal puzzle screen first.

   Scope note: Live Chess / Multiplayer Duel were *not* touched — those already
   key off a `?room=`/`?chess=` URL param and reload state from Supabase by room
   code, so they're already resilient to the tab being killed and reopened via
   the same invite link. Puzzle Rush (timed sprint) and the default puzzle flow
   were also left alone — backgrounding a running countdown timer isn't
   something "resuming" can meaningfully fix, and a lost single puzzle is low
   stakes (just loads another).

### Session 14 changes

1. **`src/App.jsx`** — Fixed legal-moves highlight bug (Bug 1).
   - `squareStyles` memo now always writes the dot gradient for `legalTargets` squares,
     overriding any existing highlight (yellow from computer's last move, red from a wrong
     attempt). Previously the condition `styles[sq]?.background ? keep existing : dot` meant
     dots were invisible on squares already highlighted by the computer's reply.
   - `onSquareClick` now calls `setHighlights({})` before setting `selectedSquare` /
     `legalTargets`, so stale highlights never obscure the newly shown dots.

2. **`src/ComputerChess.jsx`** — Fixed Review (Bug 3), added game-end menu (Bug 2), fixed
   New Game flow (Bug 4).
   - Added `masterGameRef` (a Chess object that receives every human and computer move via
     `masterGameRef.current.move(…)`). Fixes the root cause of Review being blank: game
     state was always reset to `new Chess(fen)` which loses move history, so `game.pgn()`
     returned an empty string. `masterGameRef.current.pgn()` always has the full game.
   - `saveGameToHistory` now also uses `masterGameRef.current.pgn()` so the DB row has the
     real PGN too.
   - Refactored `startGame` into `_beginGame(color, level)` shared with new `rematch()`.
   - Results screen now has four buttons: **🔄 Rematch** (same color + difficulty, no setup
     screen), **📊 Review** (uses masterGameRef PGN — actually works now), **🆕 New Game**
     (goes to setup/picker — was already `setPhase('setup')` but renamed from "Play Again"
     to make the intent clear), **Close** (back to main menu).

3. **`src/PuzzleRush.jsx`** — Fixed "3-strings" bug: only correct piece moved (Bug 5).
   - `commitMove` now validates chess legality with `chess.js` BEFORE checking correctness.
     Illegal moves → `return false` (snap back silently, no miss counted).
     Legal-but-wrong moves → red highlights, miss counted, `return true` so react-chessboard
     briefly shows the piece at the attempted square before the board re-renders back to the
     original position (game state not updated). All legal pieces now "try to move" the same
     way; the correct one is no longer the only piece that ever leaves its square.
   - `customSquareStyles` dot gradient now always overrides existing highlights for legal
     target squares (same fix as App.jsx).

## Latest code changes (Session 13 — verify pushed)

If not yet pushed, run in user's terminal:

```
git add -A
git commit -m "Instant computer moves + Google auth cross-device + user name chip"
git push
```

### Session 13 changes

1. **`src/useStockfish.js`** — Computer play uses `go movetime 80` only (no depth
   search) via `getBestMove(..., movetimeOnly: true)`. `COMPUTER_MOVETIME_MS = 80`.
   Skill Level still controls strength. Stops prior search before new `go`.
   Game Review analysis unchanged (depth-based).

2. **`src/ComputerChess.jsx`** — Pre-warms Stockfish on overlay open. Zero artificial
   delay before computer move. Uses `COMPUTER_MOVETIME_MS`.

3. **`vite.config.js`** — Prefers lite `stockfish.js` over NNUE build for mobile speed.

4. **`src/useAuth.js`** — Full auth overhaul:
   - Anonymous sign-in on load with retries
   - `signInWithGoogle()` (sign out guest → OAuth)
   - `linkGoogle()` navigates to OAuth URL
   - Handles `identity_already_exists` in URL + shows correct UI
   - OAuth callback hash cleanup

5. **`src/App.jsx`** — Account section: Sign in with Google + Link (first device).
   Signed-in name chip in header (email prefix / full name). Hidden on ≤360px width.

6. **`supabase/fix-auth-trigger.sql`** — Fixes anonymous sign-in 500 (trigger grants).
   User already ran this successfully.

7. **`DEBUG.md`** — Updated with Sessions 11–13 bug notes.

## Prior sessions (already shipped unless noted)

- Session 10: vs Computer, Game Review, QR code, Stockfish hook, 10 difficulty levels
- Session 11: Puzzle Rush click-to-move, Stockfish timeout fix, DEBUG.md
- Session 12: Anonymous auth hook, game_history schema, Puzzle Rush labels, GameReview summaries

## Next steps
1. Confirm latest Session 15 commit is on `main` and Vercel shows "Ready".
2. Test the Session 15 persistence fix: start a vs-Computer game, switch apps
   (or fully kill/reload the tab) mid-game, reopen — should resume instantly
   on the same position. Then finish a game, reload — results screen should
   still be showing until New Game is clicked.
3. Test vs Computer on phone — moves should feel near-instant after first warm-up.
4. Test Google auth: phone links once, laptop uses **Sign in with Google** only.
5. Optional: view `game_history` rows in Supabase Table Editor after vs-Computer games.
6. Future ideas:
   - Game history UI (browse past games from `game_history` table)
   - Time controls / chess clock for live chess
   - Draw offers, move notation panel
   - Adaptive difficulty in computer mode

## Known gotchas
- User runs commands in **PowerShell 5.1** — `&&` is NOT valid; use `;` or separate lines.
- `git push` must be run by the user (sandbox has no GitHub credentials).
- `.env.local` is gitignored — Vercel needs env vars set separately for production.
- `public/stockfish.js` is gitignored, copied from `node_modules/stockfish` on dev/build.
- First vs-Computer move may still take ~1s while WASM worker loads; subsequent moves ~80ms.
- **Never commit** `.env` / `.env.local` (contains Supabase anon key).

## Workflow going forward
- User splits work into separate task-chats to avoid context limits.
- Update this file after making changes so a fresh chat has the current picture.
- "NEW CHAT" trigger: update PROGRESS.md + FEATURES.md always.
