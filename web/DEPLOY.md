# Vercel デプロイ手順

このリポジトリは「Chrome拡張（ルート）」と「Webアプリ（`web/`）」が同居しています。
Next.js アプリは `web/` 配下にあるため、Vercel では **Root Directory = `web`** が必須です。

> **現状（2026-06-15〜）：GitHub 連携の自動デプロイで運用中。** 下の「現在の設定」を参照。
> `feature/webapp-migration` に push / PR マージするだけで本番（`textcount.vercel.app`）に反映されます。
> 手動 CLI デプロイ（方法B）は緊急フォールバックです。

> Supabase 環境変数を設定しなくても**ゲストモード**（カウント＋校閲のみ）で公開できます。
> 認証・履歴・共有を有効にするには `web/SETUP-supabase.md` を先に実施してください。

---

## 現在の設定（GitHub 自動デプロイ・設定済み）
Vercel プロジェクト `textcount`（Scope: `percore-s-projects` / Project ID: `prj_AqoiMFSz2okywJEW3ueTi2QM0ILC`）に、
以下が**設定済み**。新規に作り直す必要はない。

| 設定 | 値 | 場所（Vercel ダッシュボード） |
|------|----|------|
| Connected Git Repository | `percore1/02_ChromeEX_TextCount` | Settings → Git |
| **Production Branch** | **`feature/webapp-migration`** | Settings → Environments → Production → Branch Tracking |
| **Root Directory** | **`web`** | Settings → Build and Deployment → Root Directory |
| Framework Preset | Next.js（自動検出） | Settings → Build and Deployment |
| 環境変数 | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Settings → Environments |

**運用フロー**：`feature/webapp-migration` への push / PR マージ → 自動で本番デプロイ。PR を出すとプレビューURLが自動発行。

> ⚠️ よくある失敗：Root Directory が空（リポジトリのルート）だと、ルートに Next.js が無いため
> `Error: Couldn't find any 'pages' or 'app' directory` でビルドが 8 秒程度で失敗する。必ず `web` を設定すること。

### ゼロから接続し直す場合（参考）
1. https://vercel.com/ に GitHub でサインイン。
2. プロジェクト → Settings → Git で対象リポジトリを Connect。
3. Settings → Environments → Production → Branch Tracking を `feature/webapp-migration` に。
4. Settings → Build and Deployment → Root Directory を `web` に。
5. Settings → Environments で上表の環境変数を登録。
6. 接続後の初回は遡及デプロイされないので、`feature/webapp-migration` に空コミットを push してトリガー：
   `git commit --allow-empty -m "chore: trigger deploy" && git push origin feature/webapp-migration`

## 方法B：Vercel CLI（緊急フォールバック）
自動デプロイが使えないときのみ。CLI が `percore1` でログイン済みの端末から：
```
cd web
npx vercel login          # 未ログイン時のみ
npx vercel --prod         # web/ を直接アップロードして本番デプロイ
```
状況確認：`npx vercel ls --prod` / `npx vercel inspect <url> --logs`。
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
