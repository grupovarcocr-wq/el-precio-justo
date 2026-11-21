-- Physical paper mode: TV shows product + timer only; scoring is manual.
alter table rooms
  add column if not exists play_mode text not null default 'digital';
