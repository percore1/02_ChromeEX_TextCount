"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("メールアドレスまたはパスワードが正しくありません。");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("ログインに失敗しました。時間をおいて再度お試しください。");
      setLoading(false);
    }
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
        <div className="login-head">ログイン</div>

        {!isSupabaseConfigured ? (
          <div className="login-note err">
            認証はまだ設定されていません（Supabase 未接続）。<br />
            <code>web/SETUP-supabase.md</code> の手順で環境変数を設定してください。
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="login-label">メールアドレス（会員ID）</label>
            <input
              className="login-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="login-label">パスワード</label>
            <input
              className="login-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "確認中…" : "ログインする"}
            </button>
          </form>
        )}

        <div className="login-foot">
          アカウントは管理者が発行します（招待制）。
        </div>
      </div>
    </div>
  );
}
