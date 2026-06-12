# Phase 5 設計プラン — 管理画面 / 会員制 / 課金 / 付随機能

（設計のみ。実装は未着手。本番は https://textcount.vercel.app 稼働中が前提）

## 0. 目的
- **運営側（自社スタッフ）専用の管理画面**で、会員の発行・承認・停止・権限管理を行う（Supabaseダッシュボード手動から脱却）。承認業務を別スタッフに任せられるようにする。
- 利用者を2区分で提供：
  1. **自社契約の外注さん → 無料**
  2. **非契約だが使いたい人 → Stripe 月額課金**
- 付随：共有URLの一覧・失効、コメントのリアルタイム反映、PWA / コンパニオン拡張。

---

## 1. 会員・権限・課金モデル（データ設計）

### profiles（拡張）
| 列 | 値 | 用途 |
|----|----|------|
| `app_role` | `admin` / `staff` / `member` | 管理画面アクセス権（admin=全権、staff=承認・会員管理のみ、member=一般利用者） |
| `status` | `pending` / `active` / `suspended` | アカウント状態 |
| `plan` | `contract_free` / `paid` / `none` | 料金区分 |
| `stripe_customer_id` | text | Stripe顧客ID |
| `subscription_status` | `active`/`trialing`/`past_due`/`canceled`/null | Stripeサブスク状態 |
| `current_period_end` | timestamptz | 次回更新日 |
| （既存）`display_name` `member_code` | | 表示用 |

> 校閲ワークフローの editor/checker/director は別概念。混同を避けるため `workflow_role` に整理（任意）。

### access_requests（新規・申請受付）
`id, email, name, company, message, status(pending/approved/rejected), reviewed_by, created_at`

### エンタイトルメント（利用可否の単一ルール）
```
利用可能 = (status = 'active') AND
          ( plan = 'contract_free'
            OR subscription_status IN ('active','trialing') )
```
これをサーバー（proxy/Server）で判定。満たさなければ `/billing`（支払い案内 or 承認待ち）へ誘導。

---

## 2. 管理画面 `/admin`（最優先）

### アクセス制御
- ログイン必須 ＋ `app_role IN ('admin','staff')`。`proxy.ts` ＋ サーバー側で二重チェック。
- 一般会員が `/admin` に来たら 403 もしくはツールへリダイレクト。

### 機能
- **会員一覧**：状態 / プラン / 権限 / 会員ID / 最終利用 / 履歴数。検索・絞り込み。
- **発行・招待**：メール指定 → Supabase Admin API でユーザー作成 or 招待メール送信（初回PW設定）。発行時に `plan=contract_free, status=active` などを指定。
- **承認 / 却下**：`access_requests` を一覧表示し、承認（→アカウント発行）/却下。
- **会員操作**：プラン変更（契約無料へ）/ 停止・再開（status）/ 権限変更（staff付与）/ 削除。
- （任意）簡易ダッシュボード：会員数・課金状況・利用統計。

### 実装
- Next.js Route Handlers / Server Actions で **Supabase `service_role` キー（サーバー専用env）** を使用（`auth.admin.createUser` / `inviteUserByEmail` / `updateUserById`）。
- 呼び出し前に**必ず admin/staff 判定**。`service_role` は絶対にクライアントへ出さない。
- **初期管理者のブートストラップ**：自分の profile に `app_role='admin'` をSQLで一度だけ付与。

---

## 3. オンボーディング / 承認フロー（2系統）

### A) 招待（契約外注 = 無料）
管理画面でメール招待 → アカウント作成（`plan=contract_free, status=active`）→ 招待リンクで初回パスワード設定 → すぐ利用可。

### B) 自己申込 → 課金（非契約）
公開の申込 or サインアップ → 次のどちらかを選択（**要決定**）：
- **自動許可型**（推奨・運用が軽い）：サインアップ → Stripe Checkout → 決済完了Webhookで `status=active, plan=paid`。
- **審査型**：申込 → `status=pending` → 管理画面で承認 → Stripe Checkout。
→ 「契約無料は招待で手動、有料は決済で自動」のハイブリッドが運用負荷最小。審査したい場合のみ pending を挟む。

---

## 4. 課金（Stripe）

- **商品**：月額サブスク（当面1プラン）。価格・無料トライアル有無は**要決定**。
- **フロー**：Stripe Checkout（subscription）で加入 → Customer Portal で解約・カード変更。
- **Webhook** `/api/stripe/webhook`：`checkout.session.completed` / `customer.subscription.updated` / `.deleted` を受けて profiles を更新（`subscription_status, current_period_end, plan`）。署名検証必須。
- **無料契約者**：`plan=contract_free`（Stripe不要）。管理画面で付与。
- **ゲート**：エンタイトルメント未満 → `/billing` へ。
- **env（サーバー専用）**：`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID`。

---

## 5. 共有URLの一覧・失効
- `shares` に `revoked boolean default false` 追加。
- `/shares`（提出者本人）：一覧（タイトル/作成日/コメント数/URL/状態）＋**失効**ボタン。
- `get_share` RPC を `revoked=false` 条件に。失効後 `/review/<token>` は「無効なリンク」表示。

## 6. コメントのリアルタイム反映
- 課題：レビュアーは anon で RLS 直 select 不可（RPC経由）。
- 方式：Supabase Realtime の **Broadcast チャンネル `review:<token>`**。`add_comment` 成功時にブロードキャスト → 各クライアントが購読し即時反映。
- まずは**数秒ポーリング**で実装し、必要に応じて Broadcast へ（段階導入）。

## 7. PWA / コンパニオン拡張
- **PWA**：manifest + Service Worker でインストール可能化（低コスト）。
- **コンパニオン拡張**（MV3・軽量）：任意ページで選択テキストを取得 → `textcount.vercel.app` へ送る。URLクエリは長文不可のため、**一時stashトークン方式**（拡張がテキストを一時保存API→アプリがトークンで取得）を推奨。

---

## 8. セキュリティ要点
- `service_role` / Stripe secret は**サーバー専用env**（`NEXT_PUBLIC_` 禁止）。
- 管理API：admin/staff 判定後にのみ service_role を使用。
- Stripe Webhook：署名検証必須。
- RLS は継続。`/admin`・課金ルートは多層防御。

## 9. 必要な外部準備（あなた側・着手時）
- **Supabase `service_role` キー** → Vercel とローカルのサーバーenv（`SUPABASE_SERVICE_ROLE_KEY`）に追加。
- **Stripe アカウント**作成 ＋ 商品・価格（Price）作成（Phase 5c で）。

## 10. フェーズ分割（推奨順）
| # | 内容 | 外部準備 |
|---|------|---------|
| **5a** | 管理画面（会員一覧・招待発行・承認・停止・権限） | service_role キー |
| **5b** | エンタイトルメント基盤（status/plan ＋ 利用ゲート・`/billing`） | — |
| **5c** | Stripe 課金（有料）＋ 無料契約区分 | Stripe アカウント |
| **5d** | 共有URL 一覧・失効 | — |
| **5e** | コメントのリアルタイム | — |
| **5f** | PWA / コンパニオン拡張 | — |

→ ご要望どおり **5a（管理画面）から着手**するのが妥当。5b までやると会員制として完成度が上がる。

## 11. 要確認（決めていただきたいこと）
1. **非契約者の入口**：自己サインアップ＋決済で自動許可 / それとも申請→承認も必須？
2. **管理権限の粒度**：admin 1種で十分 / admin と staff（承認だけ）を分ける？
3. **月額価格・無料トライアル**の有無（5c で必要）。
4. **まず作るのは 5a（管理画面）単独でよいか**。
