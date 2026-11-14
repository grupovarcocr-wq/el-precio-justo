create table if not exists rooms (
  code text primary key,
  host_token text not null,
  phase text not null default 'lobby',
  product_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id text primary key,
  room_code text not null references rooms(code) on delete cascade,
  name text not null,
  score integer not null default 0,
  joined_at timestamptz not null default now()
);

create index if not exists players_room_code_idx on players(room_code);

create table if not exists guesses (
  room_code text not null references rooms(code) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  product_id integer not null,
  amount integer not null,
  primary key (room_code, player_id, product_id)
);

create index if not exists guesses_room_product_idx on guesses(room_code, product_id);
