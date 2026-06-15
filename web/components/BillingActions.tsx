"use client";

import { useState } from "react";

export default function BillingActions({
  stripeEnabled,
  canSubscribe,
}: {
  stripeEnabled: boolean;
  canSubscribe: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("決済ページの作成に失敗しました。");
    } catch {
      setError("通信に失敗しました。");
    }
    setLoading(false);
  }

  return (
    <div style={{ marginTop: 18 }}>
      {canSubscribe && stripeEnabled && (
        <button className="login-btn" onClick={subscribe} disabled={loading}>
          {loading ? "準備中…" : "月額プランに登録する"}
        </button>
      )}
      {canSubscribe && !stripeEnabled && (
        <div className="login-note">
          オンライン決済（月額プラン）は現在準備中です。ご利用希望の場合は管理者にお問い合わせください。
        </div>
      )}
      {error && <div className="login-error">{error}</div>}

      <form action="/auth/signout" method="post" style={{ marginTop: 14, textAlign: "center" }}>
        <button
          type="submit"
          style={{
            fontSize: 12,
            color: "var(--ink-soft)",
            background: "none",
            border: 0,
            cursor: "pointer",
          }}
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
