-- ============================================================
-- TaskFlow-Todoist — Render backend schema
-- Cách dùng: Render Postgres → chạy SQL này trong SQL Editor,
-- hoặc backend tự tạo bảng khi khởi động (initDb bên dưới).
-- ============================================================

create table if not exists users (
  id serial primary key,
  username text not null,
  username_lower text not null unique,
  password_hash text,
  google_id text unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists planner_state (
  id serial primary key,
  user_id integer not null references users (id) on delete cascade,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists planner_state_user_key_idx
  on planner_state (user_id, key);
