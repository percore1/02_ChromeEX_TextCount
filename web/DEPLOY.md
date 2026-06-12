# Vercel デプロイ手順（Phase 4）

このリポジトリは「Chrome拡張（ルート）」と「Webアプリ（`web/`）」が同居しています。
Vercel では **Root Directory = `web`** を指定してデプロイします。

> 現在 Webアプリは `feature/webapp-migration` ブランチにあり、`main` には `web/` がありません。
> **本番は当面このブランチから公開**します（CLI なら `web/` を直接アップロードするのでブランチ設定不要）。
> GitHub 連携で自動デプロイにする場合は、Vercel の **Settings → Git → Production Branch** を
> `feature/webapp-migration` に設定してください。

> Supabase 環境変数を設定しなくても**ゲストモード**（カウント＋校閲のみ）で公開できます。
> 認証・履歴・共有を有効にするには `web/SETUP-supabase.md` を先に実施してください。

---

## 方法A：GitHub 連携（推奨・自動デプロイ）
1. ブランチを push（または main にマージ）：
   ```
   git push -u origin feature/webapp-migration
   ```
2. https://vercel.com/ に GitHub でサインイン（無料）。
3. **Add New… → Project** → このリポジトリ（`02_ChromeEX_TextCount`）を Import。
4. 設定：
   - **Root Directory**: `web` ←【重要】「Edit」から選択
   - Framework Preset: `Next.js`（自動検出）
   - Build/Output: 既定のまま
5. **Environment Variables**（任意・認証を使う場合）：
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...`（anon public） |
6. **Deploy**。数分で `https://<project>.vercel.app` が発行されます。
7. 以降、push するたびに自動で本番反映（プレビューURLも自動発行）。

## 方法B：Vercel CLI
```
cd web
npx vercel login          # ブラウザで認証
npx vercel                # 初回：プロジェクト作成（Root Directory は web のまま実行）
npx vercel --prod         # 本番デプロイ
```
環境変数は `npx vercel env add NEXT_PUBLIC_SUPABASE_URL` などで追加。

---

## デプロイ後チェック
- `/` … ツール表示（未設定ならゲスト、設定済みなら `/login` へ）
- `/login` … ログイン画面
- 校閲・カウントがブラウザ内で動作
- （Supabase設定時）ログイン → 履歴保存 → 共有URL発行 → `/review/<token>` で赤入れ

## 補足
- Supabase 側の **Authentication → URL Configuration** で、本番URL（`https://<project>.vercel.app`）を Site URL / Redirect URLs に追加しておくと安全です。
- 独自ドメインは Vercel の **Settings → Domains** から割り当て可能。
- 拡張機能（リポジトリのルート）はデプロイ対象外（Root Directory=web のため無視されます）。
