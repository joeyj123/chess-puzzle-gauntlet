# Working Conventions — Chess Puzzle Gauntlet

Stable workflow notes. Doesn't change often — for session-by-session state see
PROGRESS.md.

## Environment
- User runs commands in **PowerShell 5.1** — `&&` is NOT a valid statement
  separator. Use separate lines or `;`.
- The sandbox shell has no GitHub credentials — `git push` must be run by the
  user in their own terminal.
- Repo: github.com/joeyj123/chess-puzzle-gauntlet, branch `main`.

## Session handoff convention
When the user says **"NEW CHAT"**, before ending the session:
1. Update `PROGRESS.md` — current status, uncommitted/pending changes, next steps.
2. Update `FEATURES.md` — move finished items to Done, add anything new discussed.
3. Update `.claudeignore` if new large/generated/redundant files showed up.
4. Update this file (CLAUDE.md) only if a workflow convention itself changed.

In a new chat, the user attaches/selects the Chess Puzzle App folder and says
to check PROGRESS.md for context.

## Files
- `lichess_db_puzzle.csv` (1.1GB) — raw source data for `public/puzzles.json`,
  gitignored, not needed unless regenerating the puzzle set.
- `src/data/puzzles.js` — loads/filters `public/puzzles.json` at runtime.
