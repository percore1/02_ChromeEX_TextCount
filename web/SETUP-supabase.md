# Supabase セットアップ手順（Phase 2：招待制認証＋校閲履歴）

すべて **無料枠** で完結します。所要 5〜10 分。

---

## 1. プロジェクトを作成
1. https://supabase.com/ にアクセスし、GitHub などでサインアップ（無料）。
2. 「New project」→ 組織を作成 → プロジェクト名（例 `textcount`）・データベースパスワード・リージョン（`Northeast Asia (Tokyo)` 推奨）を入力して作成。
3. 1〜2分でプロビジョニング完了。

## 2. API キーを取得
1. プロジェクト → 左メニュー **Project Settings → API**。
2. 次の2つを控える：
   - **Project URL**（`https://xxxx.supabase.co`）
   - **anon public** key（`API Keys` の `anon` `public`）
   - ※ `service_role` キーは現状の機能では不要（ブラウザに出さない）。

## 3. 環境変数を設定
`web/.env.local`（無ければ `.env.local.example` をコピー）に貼り付け：
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (anon public key)
```
> `.env.local` は `.gitignore` 済み（コミットされません）。

## 4. データベースを作成
1. Supabase → 左メニュー **SQL Editor** → 「New query」。
2. `web/supabase/schema.sql` の中身を貼り付けて **Run**。
   - `profiles`（会員プロフィール）と `proofread_history`（校閲履歴）が作成され、RLS（自分の行だけ読める）も設定されます。

## 5. 自己サインアップを無効化（招待制にする）
1. Supabase → **Authentication → Sign In / Providers**（または **Settings**）。
2. **Allow new users to sign up** を **オフ**にする。
   → これで「管理者が発行したアカウントだけがログイン可能」になります。

## 6. 会員アカウントを発行（管理者の操作）
1. Supabase → **Authentication → Users → Add user → Create new user**。
2. メールアドレスとパスワードを入力（`Auto Confirm User` をオンにすると確認メール不要）。
3. 必要なら `User Metadata` に `display_name` / `member_code` を入れると表示名・会員IDに反映されます。
   ```json
   { "display_name": "編集 花子", "member_code": "TC-0427" }
   ```
4. このメール／パスワードを会員に共有 → `/login` からログイン可能。

## 7. 動作確認
```
cd web
npm run dev
```
- 環境変数を設定済みなら、未ログイン時に `/login` へリダイレクトされます。
- 発行したアカウントでログイン → ツール表示。
- 「履歴に保存」→ 「校閲履歴」ページで一覧・再読み込み・削除を確認。

---

## パスワード再設定メールを機能させる（重要）
Authentication → **URL Configuration**：
- **Site URL**：`https://textcount.vercel.app`
- **Redirect URLs** に追加：`https://textcount.vercel.app/**` と（ローカル検証用に）`http://localhost:3000/**`
→ これで `/forgot-password` からの再設定メールのリンクが `/auth/confirm` 経由で正しく開きます。

## 補足
- **未設定のまま**でも `npm run dev` はゲストモードで動作（認証・履歴は非表示）。開発中はこのままでもOK。
- 本番（Vercel）では同じ環境変数を Vercel の Environment Variables に設定します（Phase 4）。
- Phase 3（共有URL・赤入れコメント）用のテーブルは `schema.sql` 末尾にコメントで雛形を記載済み（今は実行不要）。
