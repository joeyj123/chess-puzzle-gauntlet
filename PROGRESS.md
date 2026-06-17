# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`). Live: chess-puzzle-gauntlet.vercel.app

## Status (Session 13, 2026-06-17)
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
1. Confirm latest Session 13 commit is on `main` and Vercel shows "Ready".
2. Test vs Computer on phone — moves should feel near-instant after first warm-up.
3. Test Google auth: phone links once, laptop uses **Sign in with Google** only.
4. Optional: view `game_history` rows in Supabase Table Editor after vs-Computer games.
5. Future ideas:
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
