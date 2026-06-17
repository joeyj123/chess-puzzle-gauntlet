-- Chess Puzzle Gauntlet — Supabase database schema
-- Run this in the Supabase Dashboard → SQL Editor
-- (Project: chess-puzzle-gauntlet)

-- ── Enable anonymous sign-in ──────────────────────────────────────────────────
-- In your Supabase dashboard go to:
--   Authentication → Providers → Anonymous Sign-In → toggle ON
-- Then run this SQL.

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per authenticated user (anonymous or Google-linked).
-- Auto-created by the trigger below on first sign-in.

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  elo_rating INT  NOT NULL DEFAULT 1200,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-level security: users can only see/update their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own row read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: own row update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-insert a profile row when a new user signs in
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── game_history ──────────────────────────────────────────────────────────────
-- One row per completed game (vs Computer for now; expand to multiplayer later).

CREATE TABLE IF NOT EXISTS game_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_name  TEXT,
  player_color   TEXT,          -- 'white' | 'black'
  game_outcome   TEXT,          -- 'win' | 'loss' | 'draw'
  pgn_string     TEXT,          -- Complete PGN move list
  accuracy_score INT,           -- Overall game accuracy % (filled by GameReview engine)
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-level security: users can only see/insert their own games
ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_history: own rows read"
  ON game_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "game_history: own rows insert"
  ON game_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for fast "my recent games" queries
CREATE INDEX IF NOT EXISTS game_history_user_created
  ON game_history (user_id, created_at DESC);
