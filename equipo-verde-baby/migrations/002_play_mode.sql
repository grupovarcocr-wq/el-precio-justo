-- Digital vs paper/manual mode; existing rooms stay digital.
alter table rooms
  add column if not exists play_mode text not null default 'digital';
