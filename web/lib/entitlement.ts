// 利用可否（エンタイトルメント）— 純粋関数。proxy からも安全に import できるよう
// next/headers 等のサーバー依存を持たないモジュールに分離。
// admin/staff は常に可。それ以外は status=active かつ（契約無料 もしくは 有料サブスク有効）。
export function isEntitled(p: {
  app_role?: string | null;
  status?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
} | null): boolean {
  if (!p) return false;
  if (p.app_role === "admin" || p.app_role === "staff") return true;
  if (p.status !== "active") return false;
  if (p.plan === "contract_free") return true;
  if (
    p.plan === "paid" &&
    (p.subscription_status === "active" || p.subscription_status === "trialing")
  )
    return true;
  return false;
}
