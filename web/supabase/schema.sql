-- TextCount — Supabase スキーマ（Phase 2: 会員プロフィール＋校閲履歴）
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行してください。
-- 認証ユーザー（auth.users）は招待制で管理者が発行します（自己サインアップは無効）。

-- ========== profiles（会員プロフィール） ==========
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  member_code  text,                       -- 会員ID表示用（例: TC-0427）
  role         text not null default 'editor',  -- editor / checker / director
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- 新規ユーザー作成時に profiles を自動作成
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, member_code)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'member_code')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== proofread_history（校閲履歴） ==========
create table if not exists public.proofread_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null default '無題',
  content         text not null default '',
  counted_length  int  not null default 0,
  original_count  int  not null default 0,
  excluded_count  int  not null default 0,
  detection_count int  not null default 0,
  kanji_ratio     int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists proofread_history_user_created_idx
  on public.proofread_history (user_id, created_at desc);

alter table public.proofread_history enable row level security;

drop policy if exists "history_select_own" on public.proofread_history;
create policy "history_select_own" on public.proofread_history
  for select using (auth.uid() = user_id);

drop policy if exists "history_insert_own" on public.proofread_history;
create policy "history_insert_own" on public.proofread_history
  for insert with check (auth.uid() = user_id);

drop policy if exists "history_delete_own" on public.proofread_history;
create policy "history_delete_own" on public.proofread_history
  for delete using (auth.uid() = user_id);


-- ========== Phase 3 で追加予定（今は実行しない） ==========
-- 共有URL（編集者→チェック者→ディレクター提出）と赤入れコメント。
--
-- create table public.shares (
--   id uuid primary key default gen_random_uuid(),
--   owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
--   token text not null unique,                 -- 推測困難な公開URLトークン
--   title text, content text,                   -- 提出時点のスナップショット
--   role text not null default 'director',      -- 受け取り手の役割
--   created_at timestamptz not null default now()
-- );
-- create table public.comments (
--   id uuid primary key default gen_random_uuid(),
--   share_id uuid not null references public.shares(id) on delete cascade,
--   author_name text,
--   quote text,                                 -- 選択範囲のテキスト
--   anchor_start int, anchor_end int,           -- 範囲アンカー
--   body text not null,
--   resolved boolean not null default false,
--   created_at timestamptz not null default now()
-- );
