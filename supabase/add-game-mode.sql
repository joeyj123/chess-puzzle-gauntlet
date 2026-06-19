-- Chess Puzzle Gauntlet — migration: distinguish vs-Computer from multiplayer
-- games in game_history, so multiplayer (Live Chess) results can be listed
-- separately in the Stats tab.
--
-- Run this once in the Supabase Dashboard → SQL Editor. Safe to re-run
-- (IF NOT EXISTS / IF EXISTS guards throughout).

ALTER TABLE game_history
  ADD COLUMN IF NOT EXISTS game_mode TEXT NOT NULL DEFAULT 'computer';
  -- 'computer' | 'multiplayer'

-- Backfill: every row inserted before this migration was a vs-Computer game
-- (multiplayer history didn't exist yet), so the DEFAULT above already
-- covers them — nothing else to backfill.

-- Index for the Stats tab's "my multiplayer games" query.
CREATE INDEX IF NOT EXISTS game_history_user_mode_created
  ON game_history (user_id, game_mode, created_at DESC);
