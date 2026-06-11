# Chess Puzzle Gauntlet — Feature Roadmap

A running list of ideas. Tell Claude to add new ideas here, or to start
implementing items from a tier. Items move to "Done" once shipped.

## Tier 1 — Quick wins
(all done — see Done section)

## Tier 2 — Moderate
- [ ] Difficulty range picker/slider (filter puzzles by rating bands: 500-800, 800-1000, 1000-1200, 1200-1500, 1500-1800, 1800-2200, 2200+)
- [ ] Installable PWA ("Add to Home Screen" on mobile/desktop, works offline)
- [ ] Theme/category filter (forks, pins, endgames, mates, sacrifices, etc.)
- [ ] Tiered hint system (highlight piece -> destination square -> full move)
- [ ] Undo/takeback for the current puzzle
- [ ] Persistent stats via localStorage (accuracy, streaks, solved by theme/rating)
- [ ] Daily puzzle (deterministic pick based on date)
- [ ] Bookmark/favorite puzzles to revisit
- [ ] Better mobile layout/responsiveness

## Tier 3 — Bigger features
- [ ] Expand puzzle set beyond 10k, or periodically refresh
- [ ] Adaptive difficulty (rating nudges based on recent performance)
- [ ] "Puzzle Rush" timed mode
- [ ] Post-solve explanation of the line / why it works
- [ ] Local leaderboard for streaks/Puzzle Rush scores
- [ ] Wordle-style shareable result summary
- [ ] Achievements/badges

## Tier 4 — Stretch goals (later, after polish)
- [ ] Real-time multiplayer over wifi/internet (play a game with anyone via shareable link).
      Requires a small free backend (e.g. Supabase/Firebase realtime DB) or
      WebRTC + free signaling for move sync, rooms, and reconnection handling.

## Done
- [x] Tone down / make optional the wrong-move shake animation (toggle in ⚙ settings)
- [x] Sound toggle (move sounds, success/fail chimes)
- [x] Board theme picker (colors, piece sets)
- [x] Keyboard shortcuts (Enter/→ next puzzle, R retry, Esc close settings)
- [x] Confetti or celebratory animation on solve
