# 引き継ぎドキュメント — TextCount Webアプリ

別エージェント／別担当が単独で作業を継続するための現状サマリ（最新の単一ソース）。
**最終更新：2026-06-15 / ブランチ `feature/webapp-migration` / 本番稼働中**

---

## 0. 概要
- 既存 Chrome 拡張「TextCount」（**文字数カウント**＋**ローカルルールベース校閲チェック226ルール**）を、**Vercel デプロイの会員制 Webアプリ**へ移行したもの。ライター・編集者・外注ディレクター向け。
- **本番**：**https://textcount.vercel.app**（稼働中・認証ON・招待制）。
- 設計：[`design/web-migration-plan.md`](design/web-migration-plan.md)（移行）、[`design/phase5-admin-billing-plan.md`](design/phase5-admin-billing-plan.md)（管理/課金）、UI モック [`design/ui-mockup.html`](design/ui-mockup.html)。

## 1. 確定方針（最優先）
- 入力は**貼り付け／入力／ファイルのみ**（ページ選択の自動検出は廃止）。
- 配色は**白・黒・朱(#D6402F)の3色**、書体は**メイリオ系ゴシック**、文字色は `#262626` 系。校閲＝**朱入れ**が世界観。
- カウント・校閲・docx変換は**全てブラウザ内で完結**（原稿はサーバー送信しない）。サーバーは認証・会員・履歴・共有・カスタムルールのみ。
- 認証/DB は **Supabase に一本化**。**自己サインアップ無効＝招待制**（有料は将来 Stripe で自動許可予定）。

## 2. フェーズ進捗
| Phase | 内容 | 状態 |
|:---:|------|------|
| 1 | Next.js移植＋カウント/校閲ロジック＋新UI | ✅ 完了・実機検証済み |
| 2 | 招待制認証＋会員ごとの校閲履歴 | ✅ 完了・実機検証済み |
| 3 | 共有URL（提出）＋赤入れコメント | ✅ 完了・実機検証済み |
| 4 | Vercel 本番公開 | ✅ 公開済み |
| 5a | 運営向け管理画面（会員発行/承認/権限/プラン/状態） | ✅ 完了・admin動作確認済み |
| 5(追加) | 校閲ルール一覧(利用者) ＋ カスタムルール追加(管理者) | ✅ 完了 |
| 5(追加) | パスワード再設定フロー（メール） | ✅ 完了 |
| **5b** | **エンタイトルメント（status/planで利用ゲート）** | ⬜ 未着手（次の優先） |
| 5c | Stripe 月額課金（有料）＋無料契約区分 | ⬜ 未着手（要 Stripe アカウント） |
| 5d | 共有URLの一覧・失効(revoke) | ⬜ 未着手 |
| 5e | コメントのリアルタイム反映 | ⬜ 未着手 |
| 5f | PWA / コンパニオン拡張 | ⬜ 未着手 |

## 3. 本番・接続情報
- 本番URL：https://textcount.vercel.app（`feature/webapp-migration` を `npx vercel --prod` でデプロイ。`main` には取り込んでいない）
- Supabase プロジェクト ref：`xcjudwvgyabljxnbskgb`
- 管理者アカウント：`percore1@gmail.com`（`profiles.app_role='admin'`）。テスト用 `percore.info@gmail.com`。
- 環境変数（Vercel と `web/.env.local` の両方に設定済み。`.env.local` はGit管理外）：
  | 変数 | 公開/秘密 | 用途 |
  |------|----------|------|
  | `NEXT_PUBLIC_SUPABASE_URL` | 公開 | Supabase URL |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開 | ブラウザ/サーバーのセッション用 |
  | `SUPABASE_SERVICE_ROLE_KEY` | **秘密（サーバー専用）** | 管理API（会員発行等）。`sb_secret_…` 新形式キー。**絶対に公開・コミットしない** |

## 4. DBマイグレーション（Supabase SQL Editor で実行する順番）
1. `web/supabase/schema.sql` — profiles / proofread_history / shares / comments / RPC / RLS
2. `web/supabase/fix-grants.sql` — `authenticated` へのテーブル権限（42501対策）
3. `web/supabase/phase5-admin.sql` — 会員モデル列(app_role/status/plan/stripe_*)・access_requests・proofread_rules・admin用RLS・**service_role への権限付与**・管理者ブートストラップ例
- ブートストラップ（管理者化）：`insert into public.profiles (id,app_role,status) values ('<uid>','admin','active') on conflict (id) do update set app_role='admin',status='active';`

## 5. ローカル起動
```
cd web
npm install
npm run dev      # http://localhost:3000
npx vercel --prod  # 本番デプロイ（web/ を直接アップロード）
```
Node 24 / Next.js 16 (App Router・Turbopack・**middlewareはproxy.tsに改称**) / React 19 / @supabase/ssr。

## 6. ファイルマップ（`web/`）
```
lib/
  counting.ts             カウント＋除外（先頭タイトル/タイトル:/URL/Instagram:/価格/引用 等）＋annotateExclusions(色分け)
  proofreading.ts         校閲エンジン。loadRules=静的JSON + /api/rules(カスタム) をマージ
  auth.ts                 getAuthState()（会員プロフィール込み）, getStaffContext()（admin/staffガード）
  supabase/{client,server,config,admin}.ts  ssrクライアント/env判定/service_roleクライアント(server-only)
public/data/text_checklist.json   標準226ルール
proxy.ts                  セッション更新＋ルート保護（公開: /login /auth /forgot-password /review /request-access）
app/
  page.tsx                ツール本体（Server→TextCountTool）
  login, forgot-password, account/update-password   認証画面
  auth/confirm/route.ts   メールリンク受け皿(PKCE code / token_hash 両対応)
  auth/signout/route.ts   ログアウト
  history/page.tsx        校閲履歴
  rules/page.tsx          ルール一覧（利用者・要ログイン）→ RulesViewer
  review/[token]/page.tsx 共有レビュー（未ログイン可）
  request-access/page.tsx 利用申請（公開）
  admin/page.tsx          管理画面（admin/staff）→ AdminPanel
  admin/rules/page.tsx    カスタムルール管理（admin/staff）→ RulesAdmin
  api/history, api/shares, api/review/...     既存
  api/rules               カスタムルール参照（全ログイン）
  api/request-access      申請受付（公開）
  api/admin/members(/[id]) 会員一覧/発行/更新/削除（service_role）
  api/admin/requests(/[id]) 申請一覧/承認・却下（service_role）
  api/admin/rules(/[id])   カスタムルールCRUD（staff・RLS）
components/
  TextCountTool / HistoryList / ReviewBoard / AdminPanel / RulesViewer / RulesAdmin
supabase/  schema.sql / fix-grants.sql / phase5-admin.sql
SETUP-supabase.md / SETUP-admin.md / DEPLOY.md
```

## 7. 重要な設計ポイント
- **未設定でも壊れない**：`isSupabaseConfigured`/`isAdminConfigured` で全機能ゲート。proxy も未設定なら素通り（ゲストモード）。
- **権限**：`app_role` = admin（全権）/ staff（会員の発行・承認・停止・ルール管理）/ member（一般）。`getStaffContext()` でAPI/ページを保護。権限変更・会員削除は admin のみ。
- **service_role**：`lib/supabase/admin.ts`（`server-only`）。会員の auth 作成・profiles更新に使用。**呼び出し前に必ず staff 判定**。新形式 `sb_secret_` キー使用。RLSをバイパスするため phase5-admin.sql で service_role にテーブル権限を付与済み。
- **共有レビュー**：レビュアー未ログイン。`shares.token` を鍵に SECURITY DEFINER RPC（get_share/list_comments/add_comment/set_comment_resolved）経由。
- **カスタムルール**：`proofread_rules`（RLS: 参照=全ログイン / 編集=staff）。`/api/rules` が静的JSONと同形式で返し、`loadRules` がマージ。exact(keyword) / regex(pattern) 対応。
- **パスワード再設定**：`/forgot-password`→`resetPasswordForEmail(redirectTo=/auth/confirm?next=/account/update-password)`→`/auth/confirm`(セッション確立)→`/account/update-password`(`updateUser`)。
- **エンタイトルメント（未実装/5b）**：`status='active' AND (plan='contract_free' OR subscription_status in active/trialing)`。proxy か Server で判定し、未充足は `/billing` 等へ。**現状 status/plan は記録のみで利用ブロックは未実装**。

## 8. ユーザー側で必要な設定（実施済み/要確認）
- ✅ Supabase接続（anon）・schema.sql・fix-grants.sql 実行・本番公開・サインアップ無効化。
- ✅ phase5-admin.sql 実行・service_role 設定・percore1 を admin 化。
- ⚠ **パスワード再設定を本番で機能させるには**：Supabase → Authentication → **URL Configuration → Redirect URLs** に
  `https://textcount.vercel.app/**` と（ローカル検証用に）`http://localhost:3000/**` を追加。Site URL は本番URL。
- 会員発行は `/admin`、ルール追加は `/admin/rules`。

## 9. 主要URL
| 画面 | URL | 権限 |
|------|-----|------|
| ツール | `/` | 会員 |
| ログイン / 申請 / 再設定 | `/login` `/request-access` `/forgot-password` | 公開 |
| 校閲履歴 | `/history` | 会員 |
| ルール一覧 | `/rules` | 会員 |
| 共有レビュー | `/review/<token>` | 公開(トークン) |
| 管理画面 | `/admin` | admin/staff |
| ルール管理 | `/admin/rules` | admin/staff |

## 10. 次にやると良いこと
- **5b**：proxy/Server にエンタイトルメント判定を追加し、`/billing`（案内）を作る。suspended/未払いをブロック。
- **5c**：Stripe（Checkout/Customer Portal/Webhook `/api/stripe/webhook`）。env `STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/STRIPE_PRICE_ID`。決定事項：自己サインアップ＋決済で自動許可。
- 5d 共有失効（`shares.revoked` 追加＋`get_share`条件＋一覧UI）、5e Realtime（Broadcast `review:<token>`）、5f PWA/拡張。
- 補足：Windows のため Git の CRLF 警告は無害。`main` は未取り込み（Vercel は feature ブランチ/ローカルから）。
