-- Kahoot-style rounds: shuffled catalog order, MC options, countdown, speed points
alter table rooms
  add column if not exists product_order integer[] not null default '{}',
  add column if not exists timer_seconds integer not null default 20,
  add column if not exists round_started_at timestamptz,
  add column if not exists round_ends_at timestamptz,
  add column if not exists options integer[] not null default '{}';

alter table guesses
  add column if not exists answered_at timestamptz not null default now(),
  add column if not exists points_awarded integer not null default 0;
