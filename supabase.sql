-- Run once in Supabase → SQL Editor. Safe to run again.

-- One row per thing that happened: a song that played, a scene you picked, a finished focus session.
create table if not exists events (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  kind   text not null,
  name   text not null,
  dedupe text unique  -- lets two screens report the same song without counting it twice
);
create index if not exists events_at on events (at desc);

-- Latest known values, e.g. the phone's battery and whether you are home.
create table if not exists state (
  key   text primary key,
  value jsonb not null,
  at    timestamptz not null default now()
);

-- Row-level security on, with no policies: only the server's secret key can read or write.
alter table events enable row level security;
alter table state  enable row level security;
