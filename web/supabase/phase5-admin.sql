-- Phase 5a: 管理画面・会員モデル
-- Supabase SQL Editor に貼って Run してください（既存の schema.sql 実行後を前提）。

-- ===== profiles 拡張（会員モデル） =====
alter table public.profiles
  add column if not exists app_role            text not null default 'member',   -- admin / staff / member
  add column if not exists status              text not null default 'active',   -- pending / active / suspended
  add column if not exists plan                text not null default 'none',     -- contract_free / paid / none
  add column if not exists stripe_customer_id  text,
  add column if not exists subscription_status text,
  add column if not exists current_period_end  timestamptz;

-- 自分の app_role を安全に取得（RLS再帰回避のため SECURITY DEFINER）
create or replace function public.current_app_role()
returns text language sql security definer stable set search_path = public as $$
  select app_role from public.profiles where id = auth.uid();
$$;
grant execute on function public.current_app_role() to authenticated;

-- 管理者・スタッフは全会員を閲覧/更新できる（RLS）
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.current_app_role() in ('admin', 'staff'));

drop policy if exists "profiles_update_staff" on public.profiles;
create policy "profiles_update_staff" on public.profiles
  for update using (public.current_app_role() in ('admin', 'staff'));

-- ===== access_requests（利用申請の受付・承認） =====
create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  company     text,
  message     text,
  status      text not null default 'pending',  -- pending / approved / rejected
  reviewed_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists access_requests_status_idx on public.access_requests (status, created_at desc);
alter table public.access_requests enable row level security;

-- 誰でも（未ログイン含む）申請を作成できる
drop policy if exists "ar_insert_any" on public.access_requests;
create policy "ar_insert_any" on public.access_requests
  for insert to anon, authenticated with check (true);

-- スタッフ以上だけが閲覧・更新できる
drop policy if exists "ar_select_staff" on public.access_requests;
create policy "ar_select_staff" on public.access_requests
  for select using (public.current_app_role() in ('admin', 'staff'));

drop policy if exists "ar_update_staff" on public.access_requests;
create policy "ar_update_staff" on public.access_requests
  for update using (public.current_app_role() in ('admin', 'staff'));

grant insert on public.access_requests to anon, authenticated;
grant select, update on public.access_requests to authenticated;

-- ===== 初期管理者のブートストラップ（自分のIDに置き換えて1度だけ実行） =====
-- update public.profiles set app_role = 'admin' where id = '<あなたのユーザーID>';
-- ユーザーIDは Authentication → Users で確認できます。
