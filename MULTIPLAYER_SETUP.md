# Multiplayer Setup (Supabase — free, no credit card)

Follow these steps once. Takes ~5 minutes.

---

## 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up / log in.
2. Click **New Project**, pick a name (e.g. `chess-puzzle-gauntlet`), choose any region, set a DB password (save it somewhere).
3. Wait ~1 minute for the project to spin up.

---

## 2. Create the `rooms` table

In your Supabase project, go to **SQL Editor** and run this:

```sql
-- Game rooms for 1v1 puzzle duels
create table rooms (
  id            text        primary key,
  puzzle_id     text        not null,
  host_id       text        not null,
  guest_id      text,
  host_solved_ms integer,
  guest_solved_ms integer,
  status        text        not null default 'waiting',
  created_at    timestamptz not null default now()
);

-- Auto-delete rooms older than 2 hours to keep the table clean
create index rooms_created_at_idx on rooms (created_at);

-- Enable Row Level Security (required for Realtime)
alter table rooms enable row level security;

-- Allow anyone to read and write rooms (anon key is safe here —
-- rooms contain no personal data, just puzzle IDs and solve times)
create policy "public read"  on rooms for select using (true);
create policy "public insert" on rooms for insert with check (true);
create policy "public update" on rooms for update using (true);
```

---

## 3. Enable Realtime on the `rooms` table

1. In the Supabase dashboard go to **Database → Replication**.
2. Under **Supabase Realtime**, find the `rooms` table and toggle it **on**.

---

## 4. Get your API credentials

1. Go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://xxxx.supabase.co`).
3. Copy the **anon / public** key (the long JWT string under "Project API keys").

---

## 5. Add credentials to `.env.local`

In the project root, open `.env.local` and replace the placeholders:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY-HERE
```

---

## 6. Deploy env vars to Vercel

In your Vercel project dashboard:
1. Go to **Settings → Environment Variables**.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the same values.
3. Redeploy (or it picks them up on the next push).

---

## 7. Create the `chess_games` table (for Live Chess)

In the SQL Editor, run this as a second query (separate from the `rooms` query above):

```sql
-- Live chess games (full 1v1 games, not puzzles)
create table chess_games (
  id         text        primary key,
  host_id    text        not null,
  guest_id   text,
  fen        text        not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn        text        not null default '',
  status     text        not null default 'waiting',
  winner     text,
  created_at timestamptz not null default now()
);

create index chess_games_created_at_idx on chess_games (created_at);

alter table chess_games enable row level security;

create policy "public read"   on chess_games for select using (true);
create policy "public insert" on chess_games for insert with check (true);
create policy "public update" on chess_games for update using (true);

-- Enable Realtime on this table
alter publication supabase_realtime add table chess_games;
```

- `fen` is the authoritative board state, updated after every move.
- `status`: `waiting | playing | done`
- `winner`: `host | guest | draw` (null while playing)
- Host is always white; guest is always black.

---

## 8. (Optional) Auto-delete old rows

Old rooms and games accumulate over time. To clean them up automatically, run this SQL to
create a pg_cron job (requires the pg_cron extension, which Supabase includes):

```sql
select cron.schedule(
  'delete-old-rooms',
  '0 * * * *',  -- every hour
  $$
    delete from rooms       where created_at < now() - interval '2 hours';
    delete from chess_games where created_at < now() - interval '6 hours';
  $$
);
```

---

## Done!

Run `npm run dev`, open the ☰ menu, and tap:
- **⚔️ Duel a Friend** — puzzle race
- **♟ Play Chess** — live 1v1 chess game
