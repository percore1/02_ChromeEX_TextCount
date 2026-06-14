"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/account/update-password`,
      });
      setLoading(false);
      if (error) {
        setError("送信に失敗しました。時間をおいて再度お試しください。");
        return;
      }
      setSent(true);
    } catch {
      setLoading(false);
      setError("送信に失敗しました。");
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
        <div className="login-head">パスワード再設定</div>

        {!isSupabaseConfigured ? (
          <div className="login-note err">認証が未設定です。</div>
        ) : sent ? (
          <div className="login-note">
            パスワード再設定用のメールを送信しました。メール内のリンクを開いて、新しいパスワードを設定してください。
            <br />
            （メールが届かない場合は迷惑メールフォルダもご確認ください）
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="login-label">登録メールアドレス</label>
            <input
              className="login-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "送信中…" : "再設定メールを送る"}
            </button>
          </form>
        )}

        <div className="login-foot">
          <a href="/login">ログインに戻る</a>
        </div>
      </div>
    </div>
  );
}
