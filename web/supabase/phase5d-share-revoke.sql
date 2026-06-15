-- Phase 5d: 共有URLの失効（revoke）
-- Supabase SQL Editor で実行（schema.sql 実行後を前提）。

alter table public.shares add column if not exists revoked boolean not null default false;

-- オーナーが自分の共有を更新（失効/復活）できるRLS
drop policy if exists "shares_update_own" on public.shares;
create policy "shares_update_own" on public.shares
  for update using (auth.uid() = owner_id);

-- get_share は失効済みを返さない（レビュー画面で「無効なリンク」になる）
create or replace function public.get_share(p_token text)
returns table(id uuid, title text, content text, role text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select id, title, content, role, created_at
  from public.shares
  where token = p_token and revoked = false;
$$;
