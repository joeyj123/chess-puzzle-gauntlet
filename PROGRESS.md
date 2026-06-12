# Progress / Context Notes

Read this first in any new chat to pick up where things left off. Updated after
each work session.

## Project
Chess Puzzle Gauntlet — React + Vite PWA. Repo: github.com/joeyj123/chess-puzzle-gauntlet
(remote `origin`, branch `main`).

## Status
- Tier 1 & 2 features done (see FEATURES.md "Done" section).
- Tier 3 not started yet.

## Uncommitted changes (as of 2026-06-12)
`src/App.jsx` and `src/App.css`:
- Wrapped the daily-puzzle button in a `.stat.daily-stat` container with a
  "daily"/"exit" label underneath, matching the other header stats.
- Reworded the move-instruction text to "Drag, or tap to pick & place, a piece
  to make your move".

Not yet committed/pushed — intended commit message: "Clarify move instructions
and add label to daily puzzle button".

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
- `lichess_db_puzzle.csv` (1.1GB) is the raw source data used to generate
  `public/puzzles.json` — already gitignored, see `.claudeignore`.

## Workflow going forward
- User is splitting work into separate task-chats to avoid hitting context
  limits / compaction. Update this file after making changes so a fresh chat
  has the current picture.
- See `.claudeignore` for files that should generally be skipped when
  exploring the project.
