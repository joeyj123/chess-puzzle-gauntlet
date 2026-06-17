# Chess Puzzle Gauntlet — Feature Roadmap

A running list of ideas. Tell Claude to add new ideas here, or to start
implementing items from a tier. Items move to "Done" once shipped.

## Tier 1 — Quick wins
(all done — see Done section)

## Tier 2 — Moderate
(all done — see Done section)

## Tier 3 — Bigger features
- [x] Expand puzzle set beyond 14k (2026-06-16) — `scripts/generate-puzzles.mjs`
      written and run; `public/puzzles.json` regenerated to ~27,000 puzzles
      (ratings 500–2500, RD < 75, NbPlays > 50, balanced across 6 bands,
      Fisher-Yates shuffled). Script streams the CSV so it never loads the
      full 1.1GB into memory. Re-run anytime to refresh the set.
- [x] "Puzzle Rush" timed mode (2026-06-16) — 3 or 5 minute countdown,
      solve puzzles as fast as possible, 3 wrong on one puzzle = skip.
      Score = puzzles fully solved. Full-screen overlay launched from the
      ☰ menu. Best score shown as badge on the menu item.
- [x] Local leaderboard for Puzzle Rush scores (2026-06-16) — top-10 runs
      stored in localStorage (score, duration, date). Visible on the
      results screen after each run and in Stats panel of the main menu.
      Entries sorted by score descending, gold/silver/bronze rank colors.
- [ ] Wordle-style shareable result summary (defer — better paired with multiplayer accounts)

## Tier 4 — Stretch goals (later, after polish)
- [x] Multiplayer Puzzle Duel (2026-06-16) — 1v1 puzzle race via shareable link.
      Host clicks "⚔️ Duel a Friend" in the ☰ menu, gets a share URL
      (`?room=CODE`). Guest opens the link, both players get the same puzzle,
      3-2-1 countdown fires, first to solve wins. Results screen shows both
      times. Backend: Supabase free tier (Realtime channels + postgres_changes).
      No accounts required — anonymous player IDs in localStorage. See
      `MULTIPLAYER_SETUP.md` for Supabase setup steps.
- [x] Live 1v1 chess game (2026-06-16) — full chess game against a friend via
      shareable `?chess=CODE` link. Host plays White, guest plays Black. Real-time
      move sync via Supabase Realtime (`chess_games` table). Features: click-to-move
      + drag-and-drop, legal move dots, last-move highlight, check highlight (red
      king + pulsing warning), captured pieces display, resign with confirmation.
      Launched from ☰ menu → "♟ Play Chess".
- [ ] Time controls / chess clock (follow-up to live chess)
- [ ] Draw offers (follow-up to live chess)
- [ ] Move history / notation panel (follow-up to live chess)
- [ ] Wordle-style shareable result summary (pairs well with duel results)
- [ ] Friend system (usernames, invite by username, match history) — Tier 4 stretch

## Done
- [x] Tone down / make optional the wrong-move shake animation (toggle in ⚙ settings)
- [x] Sound toggle (move sounds, success/fail chimes)
- [x] Board theme picker (colors, piece sets)
- [x] Keyboard shortcuts (Enter/→ next puzzle, R retry, Esc close settings)
- [x] Confetti or celebratory animation on solve
- [x] Difficulty range picker/slider (filter puzzles by rating bands 500-2000, including a beginner-friendly 500-999 band)
- [x] Installable PWA (manifest + service worker, offline caching, "Add to Home Screen")
- [x] Theme/category filter (forks, pins, mates, sacrifices, endgames, etc.)
- [x] Tiered hint system (highlight piece -> destination -> full move)
- [x] Undo/takeback for the current puzzle (with stat rollback)
- [x] Better mobile layout/responsiveness (responsive breakpoints, on-screen Undo/Hint buttons)
- [x] Persistent stats via localStorage (move accuracy, solved by rating band and theme — view via "Show breakdown" in ⚙ settings)
- [x] Daily puzzle (deterministic pick based on date, 📅 button in header, ✓ badge once solved)
- [x] Achievements/badges (17 badges across solve milestones, streaks, accuracy,
      rating-band coverage, theme specialists, and daily-puzzle completion;
      🏆 button in header opens badge grid, toast + confetti + chime on unlock)
- [x] Mobile header cleanup: consolidated Daily/Achievements/Settings into a
      single ☰ menu dropdown; fixed confetti popping on app open (achievement
      backfill no longer celebrates) and confetti origin being off-center
      (now anchored to the board / toast via getBoundingClientRect)
- [x] Adaptive difficulty (optional toggle in ⚙ settings, off by default).
      Tracks a performance-based offset (±50 per solve based on overall
      accuracy, clamped ±250) and "Next Puzzle" leans toward the harder/
      easier end of the selected rating range accordingly. Does not change
      the range itself or rebuild the queue.
- [x] Mobile fit-without-scroll (2026-06-12) — pure flexbox layout
      (`.app` is `height:100dvh; overflow:hidden`, `.board-wrap` is
      `flex:1 1 0; min-height:0`), board measured via ResizeObserver and
      sized to fit both width and height. Replaces the earlier CSS-`zoom`
      scale-to-fit hack. Pinch-zoom disabled again (no longer needed).
- [x] "Explain" button (2026-06-12) — replaces the old post-solve
      explanation toggle. Sits next to Undo/Hint; replays the puzzle's
      solution move-by-move on the board, then shows why it works
      (`getExplanation`).
- [x] Three-strike rule (2026-06-12) — 3 consecutive wrong moves on the same
      puzzle auto-replays the solution, resets the current streak to 0, and
      auto-advances to the next puzzle.
- [x] Full-screen menu overhaul (2026-06-12) — ☰ menu now opens a full-screen
      overlay (covers the board entirely) with a top-level list (Today's
      Puzzle, Stats, Achievements, Settings). Stats moved into its own panel
      (Accuracy/Total solved/Streak/breakdown/Reset Stats). The "✅ solved"
      counter moved from the header into the puzzle-info bar.
- [x] Board-sizing rewrite (2026-06-12, finalized after 4 iterations) —
      board-sizing effect measures `.board-wrap`'s own
      `getBoundingClientRect()` directly (ground truth, since flex layout
      determines that box's size independent of the Chessboard child) and
      always sets `boardWidth = max(MIN_BOARD, min(width, height))`, clamped
      to a 160px floor (`MIN_BOARD`, also enforced via CSS `min-height` on
      `.board-wrap`). `overflow: hidden` on `.board-wrap` remains as a
      containment safety net. The actual fix for "ranks 1/8 chopped off" was
      a 4th-iteration bug: `.board-wrap` doesn't exist during the initial
      "Loading puzzles…" render, so the sizing effect's `[]`-deps ran once
      against a `null` ref and never again — `boardWidth` was permanently
      stuck at its `useState(480)` default. Switched to a callback ref
      (`setBoardWrapNode`) that flips a `boardWrapMounted` flag, and the
      effect now depends on `[boardWrapMounted]` so it actually runs once the
      board exists. Fixes both the "ghost buttons behind the board" overlap
      and the "ranks 1/8 chopped off" cropping.
- [x] PWA stale-cache fix (2026-06-12) — service worker now only registers in
      production builds (`import.meta.env.PROD`), so `npm run dev` no longer
      caches dev modules into an installed PWA. Bumped SW cache name to
      `puzzle-gauntlet-v3` to invalidate old installs.
