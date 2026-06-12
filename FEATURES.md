# Chess Puzzle Gauntlet — Feature Roadmap

A running list of ideas. Tell Claude to add new ideas here, or to start
implementing items from a tier. Items move to "Done" once shipped.

## Tier 1 — Quick wins
(all done — see Done section)

## Tier 2 — Moderate
(all done — see Done section)

## Tier 3 — Bigger features
- [ ] Expand puzzle set beyond 10k, or periodically refresh
- [ ] Adaptive difficulty (rating nudges based on recent performance)
- [ ] "Puzzle Rush" timed mode
- [ ] Post-solve explanation of the line / why it works
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
