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

-- ============================================================
-- V1.6A — Google Calendar (read-only) connect columns
-- Idempotent: chạy nhiều lần không lỗi (alter ... add column if not exists)
-- ============================================================
alter table users add column if not exists google_access_token text;
alter table users add column if not exists google_refresh_token text;
alter table users add column if not exists google_token_expires_at timestamptz;
alter table users add column if not exists google_scopes text;
alter table users add column if not exists google_connected_at timestamptz;

-- ============================================================
-- V1.6B — Google Calendar export mapping (TimeBlock → Google Event)
-- Idempotent: chạy nhiều lần không lỗi. Một TimeBlock ↔ tối đa 1 Event
-- (unique user_id + taskflow_block_id); retry/click lặp trả mapping cũ.
-- ============================================================
create table if not exists google_cal_mapping (
  id serial primary key,
  user_id integer not null references users (id) on delete cascade,
  taskflow_block_id text not null,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  last_synced_at timestamptz not null default now(),
  unique (user_id, taskflow_block_id)
);

create index if not exists google_cal_mapping_user_idx
  on google_cal_mapping (user_id);

-- ============================================================
-- v3.2 P2.1 — Web Push subscriptions (nhắc việc khi app đã đóng)
-- Một endpoint = một trình duyệt/thiết bị (trình duyệt cấp endpoint mới khi
-- subscribe lại) → unique(endpoint) để subscribe lặp là idempotent.
-- reminder_hour + tz_offset_minutes: giờ nhắc theo giờ ĐỊA PHƯƠNG của người
-- dùng (cron chạy theo UTC nên phải quy đổi); last_sent_at chặn gửi 2 lần/ngày.
-- Idempotent: chạy nhiều lần không lỗi.
-- ============================================================
create table if not exists push_subscription (
  id serial primary key,
  user_id integer not null references users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  reminder_hour integer not null default 20,
  tz_offset_minutes integer not null default 0,
  lang text not null default 'vi',
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures integer not null default 0
);

create index if not exists push_subscription_user_idx
  on push_subscription (user_id);
