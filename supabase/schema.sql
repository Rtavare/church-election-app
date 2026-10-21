-- Church Election — QR voting backend (Supabase / Postgres)
-- Run this once in your Supabase project's SQL editor, then set in the app's .env:
--   VITE_SUPABASE_URL=https://<your-project>.supabase.co
--   VITE_SUPABASE_ANON_KEY=<your anon public key>
--   VITE_PUBLIC_BASE_URL=https://<where the web app is hosted>
-- Ballots are anonymous: vote_ballots has no voter column, on purpose.

create table if not exists public.vote_sessions (
  code text primary key,
  title text not null,
  church text not null default '',
  lang text not null default 'en',
  open boolean not null default true,
  ballot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vote_ballots (
  id uuid primary key default gen_random_uuid(),
  session_code text not null references public.vote_sessions(code) on delete cascade,
  choices jsonb not null,
  cast_at timestamptz not null default now()
);

alter table public.vote_sessions enable row level security;
alter table public.vote_ballots enable row level security;

-- Public, session-code-gated access suitable for a church meeting:
-- anyone who has the session code (from the QR) can read that session
-- and submit a ballot while it is open. Only totals are ever displayed.
create policy "read sessions by code" on public.vote_sessions for select using (true);
create policy "create session" on public.vote_sessions for insert with check (true);
create policy "open close session" on public.vote_sessions for update using (true);
create policy "submit ballot" on public.vote_ballots for insert with check (true);
create policy "read ballots for tally" on public.vote_ballots for select using (true);

create policy "delete session (PIN rotation)" on public.vote_sessions for delete using (true);

create policy "reassign ballots (PIN rotation)" on public.vote_ballots for update using (true);
