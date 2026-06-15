# 管理画面セットアップ手順（Phase 5a）

会員の発行・承認・停止・権限管理を行う `/admin` を有効にする手順です。

---

## 1. DBマイグレーションを実行
Supabase → **SQL Editor** に `web/supabase/phase5-admin.sql` を貼って **Run**。
（profiles に会員モデル列を追加、`access_requests` 作成、admin用RLSを設定）

## 2. service_role キーをサーバー専用envに追加
Supabase → **Project Settings → API → `service_role` `secret`** をコピー。

> ⚠️ これは**全権限の秘密鍵**です。**絶対に公開・クライアントに露出させない**でください。
> `NEXT_PUBLIC_` は付けません（サーバー専用）。

- **ローカル**：`web/.env.local` に追記
  ```
  SUPABASE_SERVICE_ROLE_KEY=（service_role secret）
  ```
- **Vercel**：Project → Settings → Environment Variables に
  `SUPABASE_SERVICE_ROLE_KEY` を **Production/Preview/Development** で追加 → 再デプロイ（`feature/webapp-migration` に push すれば自動デプロイ。詳細は `web/DEPLOY.md`）。

## 3. 自分を管理者にする（初回だけ）
Supabase → Authentication → Users で自分の **User ID** を確認し、SQL Editor で：
```sql
update public.profiles set app_role = 'admin' where id = '<あなたのユーザーID>';
```

## 4. 確認
- ログイン後、左ナビに **「管理画面」** が表示される（admin/staff のみ）。
- `/admin` で：
  - **会員を発行**（メール＋プラン）→ 初期パスワードが画面表示される→本人に共有
  - **利用申請**（`/request-access` から届く）を承認・却下
  - 会員の **権限 / プラン / 状態** を変更、削除（admin のみ）

---

## 補足
- **権限**：`admin`=全権（権限変更・削除可）、`staff`=会員の発行・承認・停止のみ、`member`=一般利用者。
- **利用申請の入口**：未ログインで `/request-access` から申請可能。承認すると即アカウント発行。
- `SUPABASE_SERVICE_ROLE_KEY` 未設定でも他機能は動作（`/admin` は無効表示）。
- Stripe 課金（有料プラン自動化）は Phase 5c で対応予定。現状 `plan` は管理画面で手動設定。
