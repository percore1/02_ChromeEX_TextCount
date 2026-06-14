"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("パスワードは8文字以上で設定してください。");
      return;
    }
    if (pw !== pw2) {
      setError("確認用パスワードが一致しません。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) {
      setError("更新に失敗しました。リンクの有効期限が切れている可能性があります。再度お試しください。");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="seal">朱</div>
          <div>
            <div className="login-title">TextCount</div>
            <div className="login-sub">EDITORIAL SUITE</div>
          </div>
        </div>
        <div className="login-head">新しいパスワード</div>

        {hasSession === false ? (
          <div className="login-note err">
            再設定リンクから開いてください。リンクが無効・期限切れの場合は、
            <a href="/forgot-password">もう一度メールを送信</a>してください。
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="login-label">新しいパスワード（8文字以上）</label>
            <input
              className="login-input"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <label className="login-label">新しいパスワード（確認）</label>
            <input
              className="login-input"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "更新中…" : "パスワードを更新する"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
