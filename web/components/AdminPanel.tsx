"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Member = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  app_role: "admin" | "staff" | "member";
  status: "pending" | "active" | "suspended";
  plan: "contract_free" | "paid" | "none";
  display_name: string | null;
  member_code: string | null;
};
type Req = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

const PLAN_LABEL: Record<string, string> = {
  contract_free: "契約無料",
  paid: "有料",
  none: "なし",
};
const STATUS_LABEL: Record<string, string> = {
  active: "有効",
  pending: "保留",
  suspended: "停止",
};

export default function AdminPanel({
  role,
  selfId,
  selfEmail,
  adminConfigured,
}: {
  role: "admin" | "staff" | "member";
  selfId: string;
  selfEmail: string;
  adminConfigured: boolean;
}) {
  const isAdmin = role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // 発行直後の初期パスワード（手動で閉じるまで消えない。DBには保存しない）
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  // 発行フォーム
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [plan, setPlan] = useState("contract_free");

  const reload = useCallback(async () => {
    setLoading(true);
    const [m, r] = await Promise.all([
      fetch("/api/admin/members").then((x) => x.json()),
      fetch("/api/admin/requests").then((x) => x.json()),
    ]);
    setMembers(m.members || []);
    setRequests(r.requests || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (adminConfigured) reload();
    else setLoading(false);
  }, [adminConfigured, reload]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 6000);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${label}をコピーしました`);
    } catch {
      flash("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  };

  const createMember = useCallback(async () => {
    if (!email.trim()) return;
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, display_name: displayName, member_code: memberCode, plan }),
    });
    const data = await res.json();
    if (!res.ok) {
      flash("発行に失敗：" + (data.error || res.status));
      return;
    }
    setIssued({ email: data.email, password: data.password });
    flash("発行しました");
    setEmail("");
    setDisplayName("");
    setMemberCode("");
    reload();
  }, [email, displayName, memberCode, plan, reload]);

  const patchMember = useCallback(
    async (id: string, body: Record<string, string>) => {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        flash("更新に失敗：" + (d.error || res.status));
        reload();
      }
    },
    [reload],
  );

  const deleteMember = useCallback(
    async (m: Member) => {
      if (!confirm(`${m.email} を削除しますか？`)) return;
      const res = await fetch(`/api/admin/members/${m.id}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((list) => list.filter((x) => x.id !== m.id));
      } else {
        const d = await res.json();
        flash("削除に失敗：" + (d.error || res.status));
      }
    },
    [],
  );

  const reviewRequest = useCallback(
    async (id: string, action: "approve" | "reject") => {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash("処理に失敗：" + (data.error || res.status));
        return;
      }
      if (action === "approve" && data.password) {
        setIssued({ email: data.email, password: data.password });
        flash("承認・発行しました");
      } else {
        flash("却下しました");
      }
      reload();
    },
    [reload],
  );

  return (
    <div className="admin-page">
      <div className="admin-top">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>管理画面</h1>
            <div className="sub">
              {selfEmail}（{role === "admin" ? "管理者" : "スタッフ"}）
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="tb-file" href="/admin/rules">
            校閲ルール管理
          </Link>
          <Link className="tb-file" href="/">
            ← ツールに戻る
          </Link>
        </div>
      </div>

      {!adminConfigured && (
        <div className="admin-warn">
          サーバーに <code>SUPABASE_SERVICE_ROLE_KEY</code> が未設定のため、会員管理機能は無効です。
          <code>web/SETUP-admin.md</code> を参照して設定してください。
        </div>
      )}

      {notice && <div className="admin-notice">{notice}</div>}

      {issued && (
        <div className="admin-cred">
          <div className="admin-cred-head">
            <b>初期パスワードを発行しました</b>
            <button
              className="admin-cred-close"
              aria-label="閉じる"
              onClick={() => setIssued(null)}
            >
              ×
            </button>
          </div>
          <div className="admin-cred-rows">
            <div className="admin-cred-row">
              <span className="admin-cred-label">メール</span>
              <code className="admin-cred-value">{issued.email}</code>
              <button className="hbtn" onClick={() => copyText(issued.email, "メール")}>
                コピー
              </button>
            </div>
            <div className="admin-cred-row">
              <span className="admin-cred-label">初期パスワード</span>
              <code className="admin-cred-value">{issued.password}</code>
              <button className="hbtn" onClick={() => copyText(issued.password, "パスワード")}>
                コピー
              </button>
            </div>
          </div>
          <div className="admin-cred-actions">
            <button
              className="hbtn primary"
              onClick={() =>
                copyText(
                  `メール: ${issued.email}\n初期パスワード: ${issued.password}`,
                  "ログイン情報",
                )
              }
            >
              まとめてコピー
            </button>
            <span className="admin-cred-note">
              この内容は閉じるまで表示されます。本人に共有後、「×」で閉じてください。
            </span>
          </div>
        </div>
      )}

      {/* 会員発行 */}
      <section className="admin-card">
        <h2>会員を発行</h2>
        <div className="admin-form">
          <input
            placeholder="メールアドレス *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            placeholder="表示名（任意）"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            placeholder="会員ID（任意）"
            value={memberCode}
            onChange={(e) => setMemberCode(e.target.value)}
          />
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="contract_free">契約無料</option>
            <option value="paid">有料</option>
            <option value="none">なし</option>
          </select>
          <button className="hbtn primary" onClick={createMember} disabled={!adminConfigured}>
            発行する
          </button>
        </div>
        <p className="admin-hint">
          初期パスワードは自動生成され、発行後に画面表示されます（本人に共有してください）。
        </p>
      </section>

      {/* 利用申請 */}
      <section className="admin-card">
        <h2>
          利用申請 <span className="admin-count">{requests.filter((r) => r.status === "pending").length}</span>
        </h2>
        {requests.filter((r) => r.status === "pending").length === 0 ? (
          <div className="empty small">保留中の申請はありません。</div>
        ) : (
          <div className="admin-reqs">
            {requests
              .filter((r) => r.status === "pending")
              .map((r) => (
                <div className="admin-req" key={r.id}>
                  <div className="admin-req-main">
                    <b>{r.email}</b>
                    {r.name && <span> / {r.name}</span>}
                    {r.company && <span className="muted"> / {r.company}</span>}
                    {r.message && <div className="admin-req-msg">{r.message}</div>}
                  </div>
                  <div className="admin-req-actions">
                    <button className="hbtn primary" onClick={() => reviewRequest(r.id, "approve")}>
                      承認・発行
                    </button>
                    <button className="hbtn" onClick={() => reviewRequest(r.id, "reject")}>
                      却下
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* 会員一覧 */}
      <section className="admin-card">
        <h2>
          会員一覧 <span className="admin-count">{members.length}</span>
        </h2>
        {loading ? (
          <div className="empty small">読み込み中…</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>メール</th>
                  <th>表示名</th>
                  <th>権限</th>
                  <th>プラン</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.email}</td>
                    <td>{m.display_name || "—"}</td>
                    <td>
                      {isAdmin ? (
                        <select
                          defaultValue={m.app_role}
                          onChange={(e) => patchMember(m.id, { app_role: e.target.value })}
                        >
                          <option value="member">member</option>
                          <option value="staff">staff</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        m.app_role
                      )}
                    </td>
                    <td>
                      <select
                        defaultValue={m.plan}
                        onChange={(e) => patchMember(m.id, { plan: e.target.value })}
                      >
                        <option value="contract_free">{PLAN_LABEL.contract_free}</option>
                        <option value="paid">{PLAN_LABEL.paid}</option>
                        <option value="none">{PLAN_LABEL.none}</option>
                      </select>
                    </td>
                    <td>
                      <select
                        defaultValue={m.status}
                        className={"st-" + m.status}
                        onChange={(e) => patchMember(m.id, { status: e.target.value })}
                      >
                        <option value="active">{STATUS_LABEL.active}</option>
                        <option value="pending">{STATUS_LABEL.pending}</option>
                        <option value="suspended">{STATUS_LABEL.suspended}</option>
                      </select>
                    </td>
                    <td>
                      {isAdmin && m.id !== selfId && (
                        <button className="admin-del" onClick={() => deleteMember(m)}>
                          削除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
