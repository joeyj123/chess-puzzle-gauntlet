-- Chess Puzzle Gauntlet — Multiplayer tables migration
-- Run this in Supabase Dashboard → SQL Editor
-- Creates the rooms (Puzzle Duel) and chess_games (Live Chess) tables.

-- ── rooms ─────────────────────────────────────────────────────────────────────
-- One row per Puzzle Duel room.  Players are identified by a localStorage UUID
-- (host_id / guest_id), NOT by auth.uid(), so RLS uses permissive policies.

CREATE TABLE IF NOT EXISTS rooms (
  id              TEXT PRIMARY KEY,          -- short random room code
  puzzle_id       TEXT NOT NULL,             -- which Lichess puzzle to race on
  host_id         TEXT NOT NULL,             -- localStorage UUID of the creator
  guest_id        TEXT,                      -- localStorage UUID of the joiner
  status          TEXT NOT NULL DEFAULT 'waiting',  -- waiting | playing | done
  host_solved_ms  INT,                       -- host's solve time in milliseconds
  guest_solved_ms INT,                       -- guest's solve time in milliseconds
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: any authenticated user (including anonymous) can read/write rooms.
-- The room code acts as a shared secret — knowing the code grants access.
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms: authenticated read"
  ON rooms FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "rooms: authenticated insert"
  ON rooms FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "rooms: authenticated update"
  ON rooms FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Auto-clean stale rooms older than 24 hours (optional, avoids table bloat)
-- Supabase pg_cron is needed for this; skip if not enabled.
-- SELECT cron.schedule('clean-old-rooms', '0 * * * *',
--   $$DELETE FROM rooms WHERE created_at < NOW() - INTERVAL '24 hours'$$);

-- ── chess_games ───────────────────────────────────────────────────────────────
-- One row per Live Chess (1v1) game.

CREATE TABLE IF NOT EXISTS chess_games (
  id         TEXT PRIMARY KEY,               -- short random room code
  host_id    TEXT NOT NULL,                  -- localStorage UUID of the creator
  guest_id   TEXT,                           -- localStorage UUID of the joiner
  status     TEXT NOT NULL DEFAULT 'waiting',-- waiting | playing | done
  fen        TEXT NOT NULL,                  -- current board position (FEN)
  pgn        TEXT NOT NULL DEFAULT '',       -- full move history (PGN)
  winner     TEXT,                           -- 'host' | 'guest' | 'draw' | null
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE chess_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chess_games: authenticated read"
  ON chess_games FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "chess_games: authenticated insert"
  ON chess_games FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "chess_games: authenticated update"
  ON chess_games FOR UPDATE
  USING (auth.role() = 'authenticated');
