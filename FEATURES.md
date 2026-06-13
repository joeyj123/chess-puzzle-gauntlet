# Chess Puzzle Gauntlet — Feature Roadmap

A running list of ideas. Tell Claude to add new ideas here, or to start
implementing items from a tier. Items move to "Done" once shipped.

## Tier 1 — Quick wins
(all done — see Done section)

## Tier 2 — Moderate
(all done — see Done section)

## Tier 3 — Bigger features
- [ ] Expand puzzle set beyond 10k, or periodically refresh
      - Implementation note: regenerate `public/puzzles.json` from
        `lichess_db_puzzle.csv` (1.1GB, gitignored). Check whatever script/
        process was originally used to produce the current `puzzles.json`
        (likely a one-off Node/Python script, not currently checked in —
        find or recreate it). Decide on a target count and rating/theme
        distribution before regenerating so the bundle size stays
        reasonable for a PWA.
- [ ] "Puzzle Rush" timed mode
      - Implementation note: new top-level mode (separate from the normal
        queue) — countdown timer (e.g. 3/5 min), rapid puzzle succession,
        wrong move = either skip or end run (Lichess-style 3-strikes is a
        good model), score = puzzles solved. Needs new state machine
        (status union extended or a separate mini-component), a start
        screen, and a results screen. Store best score via
        localStorage/useStats alongside existing stats.
- [ ] Local leaderboard for streaks/Puzzle Rush scores
- [ ] Wordle-style shareable result summary

## Tier 4 — Stretch goals (later, after polish)
- [ ] Real-time multiplayer ("Opus Magnum" — needs further design before starting):
      - Beyond just a shareable link: support inviting people via phone number or
        contacts, plus a friend system (usernames/profiles) so people can find and
        challenge each other directly.
      - Real-time move sync, game rooms, reconnection handling.
      - Requires a small free backend (e.g. Supabase/Firebase realtime DB) or
        WebRTC + free signaling, plus some form of accounts/identity for the
        friend system and invites.
      - Brainstorm only for now — do not implement yet.

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
