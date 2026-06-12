-- 既に schema.sql を実行済みの場合、これだけ追加で SQL Editor に貼って Run してください。
-- 履歴保存・共有URL発行が「permission denied for table」で失敗する問題の修正です。
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.proofread_history to authenticated;
grant select, insert, delete on public.shares to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
