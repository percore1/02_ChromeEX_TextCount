# TextCount Web（エディトリアルツール）

Chrome拡張「TextCount」を会員制 Webアプリ化したもの。**文字数カウント**と**ローカルルールベース校閲チェック（226ルール）**をブラウザ内で完結して行う。

- スタック：Next.js 16 (App Router/Turbopack) ＋ React 19 ＋ TypeScript ＋ Supabase
- 入力：**貼り付け／入力／ファイル(.txt/.docx)**（ページ選択の自動検出は廃止）
- 配色：白・黒・朱の3色／書体：メイリオ系ゴシック
- 処理は全てクライアント側（原稿はサーバー送信しない）。サーバーは認証・履歴・共有のみ。

## 開発
```
npm install
npm run dev      # http://localhost:3000
npm run build    # 本番ビルド
```
Supabase 環境変数が未設定でも **ゲストモード**（カウント＋校閲のみ）で動作する。

## 機能の有効化
- 認証・履歴・共有を使うには Supabase を接続： **[SETUP-supabase.md](SETUP-supabase.md)**
- 本番公開（Vercel）： **[DEPLOY.md](DEPLOY.md)**

## 主要ディレクトリ
| パス | 役割 |
|------|------|
| `lib/counting.ts` `lib/proofreading.ts` | カウント／校閲ロジック（拡張から移植） |
| `lib/supabase/*` `lib/auth.ts` `proxy.ts` | 認証・セッション・ルート保護 |
| `app/` | ページ・APIルート（login / history / review / api） |
| `components/` | UI（TextCountTool / HistoryList / ReviewBoard） |
| `supabase/schema.sql` | DBスキーマ（profiles/history/shares/comments＋RPC＋RLS） |
| `public/data/text_checklist.json` | 校閲ルール 226件 |

## 引き継ぎ
プロジェクト全体の状況・残作業は リポジトリ直下 **[`HANDOFF.md`](../HANDOFF.md)** を参照。
