import { redirect } from "next/navigation";
import { getAuthState, isEntitled } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isStripeConfigured } from "@/lib/stripe";
import BillingActions from "@/components/BillingActions";

export default async function BillingPage() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getAuthState();
  if (!user) redirect("/login");
  // すでに利用可ならツールへ戻す
  if (isEntitled(profile)) redirect("/");

  const status = profile?.status ?? "active";
  const plan = profile?.plan ?? "none";

  let heading = "ご利用にはプランが必要です";
  let body =
    "このアカウントには有効な利用プランがありません。月額プランに登録するか、契約先の管理者にお問い合わせください。";
  if (status === "suspended") {
    heading = "アカウントが停止されています";
    body = "ご利用を再開するには、契約先の管理者にお問い合わせください。";
  } else if (status === "pending") {
    heading = "承認待ちです";
    body = "管理者の承認後にご利用いただけます。しばらくお待ちください。";
  }

  const canSubscribe = status === "active" && plan !== "contract_free";

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div className="login-brand">
          <div className="seal">朱</div>
          <div>
            <div className="login-title">TextCount</div>
            <div className="login-sub">EDITORIAL SUITE</div>
          </div>
        </div>
        <div className="login-head">利用プラン</div>
        <div className="billing-box">
          <div className="billing-heading">{heading}</div>
          <p className="billing-body">{body}</p>
          <div className="billing-meta">
            アカウント：{user.email} ／ 状態：{statusLabel(status)} ／ プラン：{planLabel(plan)}
          </div>
        </div>
        <BillingActions
          stripeEnabled={isStripeConfigured}
          canSubscribe={canSubscribe}
        />
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  return s === "active" ? "有効" : s === "suspended" ? "停止" : "保留";
}
function planLabel(p: string) {
  return p === "contract_free" ? "契約無料" : p === "paid" ? "有料" : "なし";
}
