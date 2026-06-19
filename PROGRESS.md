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

## Latest code changes (Session 16 — verify pushed)

### Session 16 changes — root-caused & fixed the "bot plays randomly / Review takes 10 min / always 100%" bug

All three symptoms the user reported (1000-difficulty bot hanging its queen and
not recapturing regardless of difficulty, Game Review taking ~10 minutes, and
both players always showing 100% accuracy) turned out to be **one root cause**:
the Stockfish engine never actually worked in production.

1. **`vite.config.js`** — the `copy-stockfish` plugin only ever copied a single
   `.js` file into `public/`, and `public/stockfish.js` had **no matching `.wasm`
   file at all**. Separately, the candidate list's first few paths
   (`stockfish/src/stockfish.js`, `stockfish-16.js`) don't exist in the
   installed `stockfish@16.0.0` package (v16 only ships NNUE builds), so it was
   silently falling through to `stockfish-nnue-16.js` — the **multi-threaded**
   build, which requires `SharedArrayBuffer` (only available with COOP/COEP
   response headers — we have no `vercel.json`, so Vercel doesn't send them)
   and which also spawns a pthread worker from a hardcoded `stockfish.worker.js`
   filename that was never copied either.
   Net effect: the Stockfish worker never sent back `readyok`/`bestmove` for
   *any* call, in production, ever.
   - Fixed by switching the candidate list to `stockfish-nnue-16-single.js`
     (single-threaded NNUE — no `SharedArrayBuffer`, no extra worker file) and
     having the plugin also copy that build's `.wasm` companion file into
     `public/` under its own original name (the engine's wasm loader looks for
     a literal hardcoded filename next to the script, not a renamed one).
     Verified the copy logic standalone: produces a byte-identical
     `stockfish.js` + `stockfish-nnue-16-single.wasm` pair in `public/`.
   - This explains all three symptoms: every "computer move" was silently
     falling back to `ComputerChess.jsx`'s random-legal-move fallback (engine
     never responded) regardless of selected difficulty; every Game Review
     position was hitting `analyzePosition`'s 20s safety-timeout one by one
     (≈20s × ~30 positions ≈ the reported 10 minutes); and every position's
     score defaulted to `0` on timeout, so every move's `cpLoss` computed to
     `0` → classified "Best" → 100% accuracy for both sides every game.
   - `.gitignore` updated to also ignore the generated `.wasm` companion file.

2. **`src/useStockfish.js`** — `movetimeForSkill(skill)` added: scales the
   computer's per-move search time from 80ms (skill 0) up to ~260ms (skill 20)
   instead of a flat 80ms for every difficulty. Still feels instant to a human,
   but meaningfully more search budget at higher difficulties — the
   speed/strength middle ground requested, given Stockfish 16 only ships NNUE
   builds (no separate "lite" engine exists to swap in; strength now also
   benefits from the engine actually working per fix #1 above).
   - `getComputerMove(fen, movetime)` now takes an optional movetime override;
     `ComputerChess.jsx` passes `movetimeForSkill(lv.skill)` at both call sites
     (warm-up + actual move).
   - `getClassificationSummary(cls, cpLoss, extra)` rewritten to give specific
     per-move feedback instead of one canned sentence per category — now
     reports the actual pawn-equivalent eval swing and names the engine's
     preferred move (in SAN, e.g. "Nf3") when it differs from what was played.

3. **`src/GameReview.jsx`** — each analyzed move now also computes
   `bestMoveSan` (the engine's UCI best-move converted to algebraic notation
   via a `chess.js` probe on the pre-move position, wrapped in try/catch) so
   both the move-summary text and the "Best: …" hint under the board show a
   readable move like "Nf3" instead of raw squares like "g1→f3".

4. **`src/useAuth.js` + `src/App.jsx`** — added a Sign Out button (Account
   settings section). Signs out of Supabase on this device and immediately
   re-establishes a fresh guest session. Note: Supabase sessions are
   per-device — signing in on a second device does **not** auto-sign-out the
   first one (no built-in single-session enforcement); multi-device
   simultaneous sign-in with the same Google account already works via
   "Sign in with Google" for devices after the first.

- **User should retest after this session's fix lands**: vs-Computer play at
  each difficulty should now show real strategic differences (not random
  blunders), and Game Review should finish in well under a minute with varied,
  non-100% accuracy scores.

### Session 17 changes

1. **`src/App.css`** — fixed the Game Review notch/scroll bug, scoped only to
   `.review-overlay` (no other overlay touched). Root cause: `.review-overlay`
   inherited `justify-content: center` from the shared `.duel-overlay` rule,
   so when its content overflowed, the overflow was centered (top got cut off
   by the phone's notch/front camera) instead of starting at the top and
   scrolling. Fixed with `justify-content: flex-start`, `overflow-y: auto`,
   and `padding-top: max(1.5rem, env(safe-area-inset-top, 1.5rem))` (a numeric
   floor, since `env()` isn't populated on all Android punch-hole devices).

2. **Multiplayer (Live Chess) game history** — persisted to Supabase,
   excludes vs-Computer games, viewable + reviewable from the Stats tab.
   - **`supabase/schema.sql`** — added `game_mode TEXT NOT NULL DEFAULT
     'computer'` to `game_history` (`'computer' | 'multiplayer'`) plus an index
     on `(user_id, game_mode, created_at DESC)`.
   - **`supabase/add-game-mode.sql`** (new) — migration for the user's
     already-deployed DB (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` +
     matching index). **User still needs to run this once in the Supabase SQL
     Editor** — see note below.
   - **`src/ComputerChess.jsx`** — its existing `game_history` insert now sets
     `game_mode: 'computer'` explicitly.
   - **`src/LiveChess.jsx`** — added `saveGameToHistory(absWinner, pgn,
     myRole)`, called from all three places a multiplayer game can end:
     checkmate/stalemate/etc. detected locally (`checkGameOver`), resigning
     locally (`handleResign`), and learning the game ended via the opponent's
     move through Supabase Realtime (`subscribeToGame`'s `UPDATE` handler) —
     this last path is how the player who *didn't* deliver the final blow
     still gets their own row saved. A `savedHistoryRef` guards against
     double-saving when a player's own DB write echoes back to them via their
     own subscription. Takes a new `userId` prop (LiveChess has its own
     non-Supabase-auth player-identity system, so this had to be threaded in
     separately, mirroring `ComputerChess`). Fixed a stale-closure risk:
     `subscribeToGame` is `useCallback(fn, [])` so its handler only ever sees
     first-render props — `saveGameToHistory` now takes `myRole` as an
     explicit parameter at every call site (not read from `role` state) and
     reads the user id from a `userIdRef` kept in sync via `useEffect`.
   - **`src/App.jsx`** — `<LiveChess>` now receives `userId={user?.id ?? null}`
     (same pattern as `<ComputerChess>`). Stats tab gained a "Multiplayer
     games" list: fetches the signed-in user's `game_mode = 'multiplayer'`
     rows on opening the tab, shows date/color/outcome per row, and each row's
     "Review" button reuses the existing `reviewPgn`/`reviewColor`/
     `reviewOpen` state to open `GameReview` — same flow as reviewing a
     vs-Computer game.
   - **`src/App.css`** — small additions for the new list (`.mp-history`,
     `.mp-history-row`, `.mp-outcome-{win,loss,draw}` color coding); no
     existing rules changed.

**Action needed from user:** run `supabase/add-game-mode.sql` once in the
Supabase Dashboard → SQL Editor (safe to re-run; only needed because the
table already existed before `game_mode` did). New installs running the full
`schema.sql` already get the column.

### Session 18 changes — two bugs found while testing Session 17 on an iPhone 16 Pro Max

1. **`src/App.css`** — Session 17's notch fix wasn't enough clearance on
   Dynamic Island devices: the accuracy pills were still touching/behind the
   camera cutout. `.review-overlay`'s top padding floor raised from `1.5rem`
   to `3.25rem`, and on top of that, now adds a `16px` buffer **on top of**
   the reported `env(safe-area-inset-top)` (not just as a floor) — the
   reported inset lands right at the island's edge with zero breathing room,
   so content drawn exactly there still visually clips it. Still scoped only
   to `.review-overlay`.

2. **Sign in with Google / Link Google "did nothing"** — actually a
   navigation bug, not an auth bug. Tapping either button does a real
   full-page redirect to Google and back (not a SPA route change), which
   wipes all React state. `App.jsx`'s `computerOpen` initializes from
   `hasSavedComputerGame()` — true for a *finished* game too, by design, so
   backgrounding/reopening the PWA mid-game resumes it. But that same check
   fired on the OAuth-return reload too, so the user got dumped straight back
   onto the old bot game's game-over screen with no visible sign anything
   happened — sign-in had actually completed underneath it.
   - **`src/useAuth.js`** — `signInWithGoogle`/`linkGoogle` now call
     `markOAuthPending()` (sets `sessionStorage['cpg-oauth-pending'] = '1'`)
     right before `window.location.href = data.url`.
   - **`src/App.jsx`** — new `consumeOAuthPending()` reads + clears that flag
     once on mount (`oauthReturn`). When true: `computerOpen`'s initializer
     skips `hasSavedComputerGame()` (so the old game doesn't reopen), and
     `menuOpen`/`activePanel` initialize open to `'settings'` instead, so the
     user lands back exactly where they'd expect and can see "Signed in as
     …". Normal app loads (no pending OAuth flag) are unaffected.

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
