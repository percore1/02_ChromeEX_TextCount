"use client";

import { useState } from "react";

type Share = {
  id: string;
  title: string;
  token: string;
  created_at: string;
  revoked: boolean;
  comment_count: number;
};

export default function SharesList({ items }: { items: Share[] }) {
  const [list, setList] = useState(items);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function toggleRevoke(s: Share) {
    setList((l) => l.map((x) => (x.id === s.id ? { ...x, revoked: !x.revoked } : x)));
    await fetch(`/api/shares/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revoked: !s.revoked }),
    });
  }

  function copy(token: string) {
    navigator.clipboard?.writeText(`${origin}/review/${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  }

  if (list.length === 0) {
    return <div className="empty">発行した共有URLはありません。</div>;
  }

  return (
    <div className="history-grid">
      {list.map((s) => (
        <div className="history-card" key={s.id} style={s.revoked ? { opacity: 0.6 } : undefined}>
          <div className="history-title">{s.title || "無題"}</div>
          <div className="history-meta">
            <span>コメント {s.comment_count} 件</span>
            <span className="dot-sep" />
            <span style={{ color: s.revoked ? "var(--shu-deep)" : "var(--ink-soft)" }}>
              {s.revoked ? "失効済み" : "有効"}
            </span>
          </div>
          <div className="history-date">{new Date(s.created_at).toLocaleString("ja-JP")}</div>
          <div className="history-actions">
            <button className="hbtn" onClick={() => copy(s.token)} disabled={s.revoked}>
              {copied === s.token ? "✓ コピー" : "URLコピー"}
            </button>
            <a
              className="hbtn primary"
              href={`/review/${s.token}`}
              target="_blank"
              rel="noreferrer"
              style={s.revoked ? { pointerEvents: "none", opacity: 0.5 } : undefined}
            >
              開く
            </a>
            <button className="hbtn" onClick={() => toggleRevoke(s)}>
              {s.revoked ? "復活" : "失効する"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
