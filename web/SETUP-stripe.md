# Stripe 課金セットアップ（Phase 5c）

非契約ユーザー向けの**月額サブスク**を有効化する手順。**Stripe アカウントが必要**。
未設定でもアプリは動作し、`/billing` は「決済は準備中」を表示する（契約無料・admin/staff は影響なし）。

> 方針：自己サインアップ＋決済で**自動的に利用可**（`status=active` かつ `plan=paid` & `subscription_status=active/trialing`）。

## 1. Stripe で商品・価格を作成
1. https://dashboard.stripe.com/ でアカウント作成。
2. **Product** を作成（例：TextCount 月額）→ **Price**：継続（recurring）/ 月額 / 金額を設定 → **Price ID（`price_...`）** を控える。

## 2. APIキー
- **Secret key（`sk_...`）**：Developers → API keys。
- テスト導入時は `sk_test_...` でOK。

## 3. Webhook を設定
1. Stripe → Developers → **Webhooks → Add endpoint**。
2. Endpoint URL：`https://textcount.vercel.app/api/stripe/webhook`
3. 購読イベント：`checkout.session.completed` / `customer.subscription.created` / `.updated` / `.deleted`
4. 作成後の **Signing secret（`whsec_...`）** を控える。

## 4. 環境変数（サーバー専用・`NEXT_PUBLIC_` を付けない）
Vercel → Settings → Environment Variables（と必要ならローカル `web/.env.local`）：
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```
→ `feature/webapp-migration` に push すれば自動デプロイで反映。

## 5. 動作（設定後）
- 非契約ユーザー（`plan=none` 等で利用不可）は `/billing` に誘導され、「月額プランに登録する」ボタンが表示される。
- 登録 → Stripe Checkout → 完了 Webhook で `plan=paid` / `subscription_status=active` に更新 → 利用可。
- 解約・カード変更は `/api/stripe/portal`（カスタマーポータル）。※ポータルへの導線UIは必要に応じて追加。

## ローカルでの Webhook テスト
`stripe listen --forward-to localhost:3000/api/stripe/webhook` で `whsec_...` を取得して `.env.local` に設定。
