# 引き継ぎドキュメント — TextCount Webアプリ移行

別エージェント／別担当が作業を継続するための現状サマリ。
（最終更新：2026-06-12 / ブランチ `feature/webapp-migration`）

---

## 0. これは何のプロジェクトか
- 既存：Chrome拡張「TextCount」＝**文字数カウント**＋**ローカルルールベース校閲チェック**（226ルール）。ライター・編集者向け。
- ゴール：これを **Vercel デプロイの会員制 Webアプリ**化する。**会員ID発行制（招待制）でログインしたユーザーだけ**が Web 上でツールを使える形に。
- 設計の詳細・意思決定は [`design/web-migration-plan.md`](design/web-migration-plan.md)、UIモックアップは [`design/ui-mockup.html`](design/ui-mockup.html)。

## 1. 確定した方針（ユーザー指示・最優先）
- **入力は貼り付け／入力のみ**。拡張版の「ページ選択の自動リアルタイム検出」は**廃止**（content script 依存ゼロ）。
- **配色は白・黒・朱の3色**、**書体はメイリオ系ゴシック**（可読性優先・明朝不可）。文字色は真っ黒でなく `#262626` 系の濃淡。
- 校閲＝**朱入れ（赤ペン）** を世界観の軸に。アクセントは朱色 `#D6402F`。
- **処理は全てブラウザ内で完結**（原稿はサーバーに送らない）。サーバーに乗るのは認証・会員情報・履歴・共有のみ。
- 認証は **Supabase に一本化**（無料枠。認証＋DB＋RLS＋RPC＋将来Realtime）。**自己サインアップ無効＝招待制**。
- 既存ドキュメントと齟齬があれば本方針を優先（必要ならドキュメント側を書き換える）。

## 2. フェーズ進捗
| Phase | 内容 | 状態 |
|:---:|------|------|
| 1 | Next.js雛形＋カウント/校閲ロジック移植＋新UI | ✅ 完了・**ローカル動作検証済み** |
| 2 | 招待制認証＋会員ごとの校閲履歴（Supabase） | ✅ 完了・**Supabase接続済み・実機検証済み** |
| 3 | 共有URL（提出）＋赤入れコメント | ✅ 完了・**実機検証済み**（anonトークンで赤入れ確認） |
| 4 | Vercelデプロイ | ✅ **本番公開済み → https://textcount.vercel.app** |
| 5（任意） | コンパニオン拡張／PWA | 未着手 |

**本番**：https://textcount.vercel.app （`feature/webapp-migration` を Vercel CLI で公開。Vercel に Supabase の env 設定済み・認証ON）。
`main` には未取り込み（本番は feature ブランチから）。Supabase プロジェクト `xcjudwvgyabljxnbskgb`。

コミット：`f5b9d91`(P1) → `e1bf3dc`(P2) → `3f7fac9`(P3+4)

## 3. いまのブロッカー＝ユーザー側の外部操作2点
1. **Supabase プロジェクト作成＋キー設定** → [`web/SETUP-supabase.md`](web/SETUP-supabase.md)
2. **Vercel ログイン＋Import**（本番公開） → [`web/DEPLOY.md`](web/DEPLOY.md)
- どちらも未実施でも、アプリは**ゲストモード**（カウント＋校閲のみ／認証・履歴・共有は非表示）で動く。

---

## 4. ローカル起動（ゲストモード）
```
cd web
npm install        # 初回のみ
npm run dev        # http://localhost:3000（使用中なら自動で別ポート）
```
Node 24 / Next.js 16 (App Router, Turbopack) / React 19。

## 5. アーキテクチャ / ファイルマップ（`web/`）
```
lib/
  counting.ts                 文字数カウント＋除外ロジック（拡張から純TS移植）
  proofreading.ts             校閲エンジン226ルール・全detector（ESモジュール化）
  auth.ts                     getAuthState()（サーバー側の認証状態）
  supabase/{client,server,config}.ts  @supabase/ssr クライアント・env判定
public/data/text_checklist.json  校閲ルール（拡張からコピー）
proxy.ts                      Next16のmiddleware後継。セッション更新＋ルート保護（未設定時は素通り）
app/
  layout.tsx / globals.css    lang=ja・白黒朱テーマ
  page.tsx                    ツール本体（Server）→ TextCountTool に props
  login/page.tsx              招待制ログイン（自己サインアップなし）
  auth/signout/route.ts       ログアウト
  history/page.tsx            校閲履歴一覧（要ログイン）
  review/[token]/page.tsx     共有レビュー画面（未ログイン可）
  api/history(/[id])          履歴 保存/一覧/取得/削除（RLS）
  api/shares                  共有URL発行（要ログイン）
  api/review/[token]/...      共有取得・コメント追加・解決（トークン経由RPC）
components/
  TextCountTool.tsx           3ペインUI（左ナビ/中央エディタ/右結果）＋履歴/共有ボタン
  HistoryList.tsx             履歴カード
  ReviewBoard.tsx             選択範囲コメント（赤入れ）UI
supabase/schema.sql           profiles + proofread_history + shares + comments + RPC + RLS
```

### 重要な設計ポイント
- **Supabase未設定でも壊れない**：`isSupabaseConfigured`（env有無）で全機能をゲート。`proxy.ts` も未設定なら `NextResponse.next()`。
- **共有レビューのアクセス制御**：レビュアーは未ログイン。`shares.token`（推測困難）を鍵に、`SECURITY DEFINER` のRPC（`get_share`/`list_comments`/`add_comment`/`set_comment_resolved`）経由でのみアクセス。owner はRLSで自分の行を管理。**service_role キーは使わない**（anon public のみ）。
- **コメントのアンカー**：本文先頭からの文字オフセット（`anchor_start`/`anchor_end`）＋ `quote`。`ReviewBoard` の `offsetOf()` が選択範囲→オフセットを算出。
- **校閲ハイライト**：occurrence の位置マップから span/sentence を重ねて描画（`TextCountTool.buildHighlightNodes` / `ReviewBoard.buildCommentNodes`）。

## 6. 検証済み / 未検証
- ✅ 検証済み：`tsc`・`next build` パス。カウント整合（サンプル171字→129字・除外42・漢字比率29%）、校閲パイプライン（226ルール→9件検出・手動20件）。ゲストモードのルート挙動。
- ⚠ 未検証（Supabase接続後に要確認）：ログイン、履歴の保存/一覧/復元、共有URL発行、`/review/[token]` の赤入れ・解決・ハイライト、RLS/RPCの権限。

---

## 7. 次の担当者がやること（Supabase 準備完了後）
1. ユーザーから **Project URL** と **anon public key** を受領 → `web/.env.local` に設定（`.env.local.example` 参照）。
2. Supabase SQL Editor で **`web/supabase/schema.sql` を実行**（profiles/history/shares/comments/RPC/RLS）。
3. Authentication で **自己サインアップを無効化**、テスト用ユーザーを発行（`SETUP-supabase.md` の手順6）。
4. `npm run dev` で通し動作確認（チェックリスト）：
   - [ ] 未ログインで `/` → `/login` にリダイレクト
   - [ ] 発行アカウントでログイン → ツール表示・ユーザー名表示
   - [ ] 原稿入力 → 「履歴に保存」→ `/history` に出る → 「開く」で本文復元
   - [ ] 「提出（共有URL）」→ モーダルのURLを別ブラウザ/シークレットで開く（未ログイン）
   - [ ] `/review/[token]` で本文選択 → コメント（赤入れ）→ 一覧に出る・本文ハイライト・解決トグル
   - [ ] 提出者側で該当共有のコメントが見える（RLS）
5. 問題なければ **Phase 4**：`web/DEPLOY.md` に沿って Vercel（Root=`web`）へ。Vercelにも同じ環境変数を設定。Supabaseの URL Configuration に本番URLを追加。

## 8. 既知のTODO / 改善余地
- 会員発行は当面 Supabase ダッシュボード手動。将来は管理画面（`/admin`）を作る余地あり（service_role が必要になる）。
- 共有の一覧・失効（revoke）UIは未実装（`shares` テーブルはあるので追加可能）。
- Phase 3 のコメントはポーリングなし（再読込で反映）。将来 Supabase Realtime で即時反映可能。
- Windows のため Git が CRLF 警告を出すが無害。
