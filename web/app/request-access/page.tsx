"use client";

import { useState } from "react";

export default function RequestAccessPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/request-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, company, message }),
    });
    setLoading(false);
    if (res.ok) setDone(true);
    else setError("送信に失敗しました。メールアドレスをご確認ください。");
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
        <div className="login-head">利用申請</div>

        {done ? (
          <div className="login-note">
            申請を受け付けました。担当者が確認のうえ、アカウント発行のご連絡をいたします。
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="login-label">メールアドレス *</label>
            <input
              className="login-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label className="login-label">お名前</label>
            <input className="login-input" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="login-label">会社名・媒体名</label>
            <input
              className="login-input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <label className="login-label">ご用件（任意）</label>
            <textarea
              className="login-input"
              style={{ minHeight: 72, resize: "vertical" }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            {error && <div className="login-error">{error}</div>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "送信中…" : "申請する"}
            </button>
          </form>
        )}

        <div className="login-foot">
          すでにアカウントをお持ちの方は <a href="/login">ログイン</a>
        </div>
      </div>
    </div>
  );
}
