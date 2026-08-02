-- ============================================================
-- TaskFlow-Todoist — Supabase schema
-- Cách dùng: Supabase Dashboard → SQL Editor → New query → chạy file này
-- ============================================================

-- Bảng lưu trạng thái kế hoạch (mirror của localStorage, 1 dòng = 1 key)
--   key = 'planner-2026-1' | 'planner-year-2026' | 'january-planner-2026'
create table if not exists public.planner_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

-- Chỉ mục truy vấn nhanh theo user + key
create index if not exists planner_state_user_key_idx
  on public.planner_state (user_id, key);

-- ============================================================
-- Tự động cập nhật updated_at khi sửa
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_planner_state_updated_at on public.planner_state;
create trigger trg_planner_state_updated_at
  before update on public.planner_state
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security — mỗi người chỉ thấy dữ liệu của mình
-- ============================================================
alter table public.planner_state enable row level security;

drop policy if exists "planner_state_select_own" on public.planner_state;
create policy "planner_state_select_own"
  on public.planner_state for select
  using (auth.uid() = user_id);

drop policy if exists "planner_state_insert_own" on public.planner_state;
create policy "planner_state_insert_own"
  on public.planner_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "planner_state_update_own" on public.planner_state;
create policy "planner_state_update_own"
  on public.planner_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "planner_state_delete_own" on public.planner_state;
create policy "planner_state_delete_own"
  on public.planner_state for delete
  using (auth.uid() = user_id);

-- ============================================================
-- (Tuỳ chọn) Cấp quyền cho anon key — chỉ cần nếu dùng anonymous sign-in
-- ============================================================
grant select, insert, update, delete on public.planner_state to anon, authenticated;
