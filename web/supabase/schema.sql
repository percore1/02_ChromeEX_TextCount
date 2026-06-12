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


-- ========== Phase 3: 共有URL（提出）＋赤入れコメント ==========
-- 編集者→チェック者→ディレクターへ「共有URL」で提出し、URL先で選択範囲に
-- コメント（赤入れ）を返せる。レビュアーはログイン不要（トークンが認可になる）。
create extension if not exists pgcrypto;

-- shares: 提出スナップショット。token（推測困難）が公開URLの鍵。
create table if not exists public.shares (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  title      text not null default '無題',
  content    text not null default '',
  role       text not null default 'director',  -- 受け取り手の役割
  created_at timestamptz not null default now()
);
create index if not exists shares_owner_idx on public.shares (owner_id, created_at desc);
alter table public.shares enable row level security;

drop policy if exists "shares_select_own" on public.shares;
create policy "shares_select_own" on public.shares for select using (auth.uid() = owner_id);
drop policy if exists "shares_insert_own" on public.shares;
create policy "shares_insert_own" on public.shares for insert with check (auth.uid() = owner_id);
drop policy if exists "shares_delete_own" on public.shares;
create policy "shares_delete_own" on public.shares for delete using (auth.uid() = owner_id);

-- comments: 選択範囲アンカー付きコメント。
create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  share_id     uuid not null references public.shares(id) on delete cascade,
  author_name  text not null default '匿名',
  quote        text not null default '',  -- 選択範囲のテキスト
  anchor_start int  not null default 0,
  anchor_end   int  not null default 0,
  body         text not null,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists comments_share_idx on public.comments (share_id, created_at);
alter table public.comments enable row level security;

-- オーナー（提出者）は自分の共有のコメントを直接参照・管理できる。
drop policy if exists "comments_owner_all" on public.comments;
create policy "comments_owner_all" on public.comments for all
  using (exists (select 1 from public.shares s where s.id = share_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.shares s where s.id = share_id and s.owner_id = auth.uid()));

-- レビュアー（未ログイン）はトークン経由の SECURITY DEFINER 関数だけでアクセスする。
create or replace function public.get_share(p_token text)
returns table(id uuid, title text, content text, role text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, title, content, role, created_at from public.shares where token = p_token;
$$;

create or replace function public.list_comments(p_token text)
returns setof public.comments
language sql security definer set search_path = public as $$
  select c.* from public.comments c
  join public.shares s on s.id = c.share_id
  where s.token = p_token
  order by c.created_at;
$$;

create or replace function public.add_comment(
  p_token text, p_author text, p_quote text, p_start int, p_end int, p_body text)
returns public.comments
language plpgsql security definer set search_path = public as $$
declare s_id uuid; row public.comments;
begin
  select id into s_id from public.shares where token = p_token;
  if s_id is null then raise exception 'invalid token'; end if;
  insert into public.comments(share_id, author_name, quote, anchor_start, anchor_end, body)
  values (s_id, coalesce(nullif(p_author, ''), '匿名'), p_quote, p_start, p_end, p_body)
  returning * into row;
  return row;
end; $$;

create or replace function public.set_comment_resolved(p_token text, p_comment uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s_id uuid;
begin
  select id into s_id from public.shares where token = p_token;
  if s_id is null then raise exception 'invalid token'; end if;
  update public.comments set resolved = p_resolved where id = p_comment and share_id = s_id;
end; $$;

grant execute on function public.get_share(text) to anon, authenticated;
grant execute on function public.list_comments(text) to anon, authenticated;
grant execute on function public.add_comment(text, text, text, int, int, text) to anon, authenticated;
grant execute on function public.set_comment_resolved(text, uuid, boolean) to anon, authenticated;
