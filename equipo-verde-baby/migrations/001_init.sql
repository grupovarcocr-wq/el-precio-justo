create table if not exists rooms (
  code text primary key,
  host_token text not null,
  phase text not null default 'lobby',
  card_index integer not null default 0,
  card_order text[] not null default '{}',
  timer_seconds integer not null default 25,
  round_started_at timestamptz,
  round_ends_at timestamptz,
  answer_buckets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id text primary key,
  room_code text not null references rooms(code) on delete cascade,
  name text not null,
  score integer not null default 0,
  team text not null default 'orange',
  joined_at timestamptz not null default now()
);

create index if not exists players_room_code_idx on players(room_code);

create table if not exists answers (
  room_code text not null references rooms(code) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  card_id text not null,
  answer_text text not null,
  answer_norm text not null,
  answered_at timestamptz not null default now(),
  points_awarded integer not null default 0,
  matched boolean not null default false,
  agility_bonus integer not null default 0,
  team_before text not null default 'orange',
  team_after text not null default 'orange',
  primary key (room_code, player_id, card_id)
);

create index if not exists answers_room_card_idx on answers(room_code, card_id);
