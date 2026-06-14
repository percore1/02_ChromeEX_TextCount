"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CustomRule = {
  id: string;
  category: string;
  check_item: string;
  severity: string;
  detection_type: string;
  keyword: string | null;
  pattern: string | null;
  recommended_word: string | null;
  message: string | null;
  explanation: string | null;
  enabled: boolean;
  created_at: string;
};

export default function RulesAdmin({ selfEmail }: { selfEmail: string }) {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    category: "",
    check_item: "",
    severity: "info",
    detection_type: "exact",
    keyword: "",
    pattern: "",
    recommended_word: "",
    message: "",
    explanation: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const reload = useCallback(async () => {
    setLoading(true);
    const j = await fetch("/api/admin/rules").then((r) => r.json());
    setRules(j.rules || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 4000);
  };

  const create = useCallback(async () => {
    const res = await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      flash("追加に失敗：" + (data.error || res.status));
      return;
    }
    flash("ルールを追加しました");
    setForm({
      category: "",
      check_item: "",
      severity: "info",
      detection_type: "exact",
      keyword: "",
      pattern: "",
      recommended_word: "",
      message: "",
      explanation: "",
    });
    reload();
  }, [form, reload]);

  const toggle = useCallback(
    async (r: CustomRule) => {
      setRules((list) => list.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
      await fetch(`/api/admin/rules/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !r.enabled }),
      });
    },
    [],
  );

  const remove = useCallback(async (r: CustomRule) => {
    if (!confirm(`「${r.check_item}」を削除しますか？`)) return;
    setRules((list) => list.filter((x) => x.id !== r.id));
    await fetch(`/api/admin/rules/${r.id}`, { method: "DELETE" });
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-top">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>校閲ルールの管理</h1>
            <div className="sub">{selfEmail}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="tb-file" href="/rules">
            ルール一覧
          </Link>
          <Link className="tb-file" href="/admin">
            ← 管理画面
          </Link>
        </div>
      </div>

      {notice && <div className="admin-notice">{notice}</div>}

      <section className="admin-card">
        <h2>ルールを追加</h2>
        <div className="rule-form">
          <label>ルール名 *</label>
          <input value={form.check_item} onChange={(e) => set("check_item", e.target.value)} placeholder="例：二重表現「まず最初に」" />

          <label>カテゴリ</label>
          <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="例：冗長表現" />

          <label>重要度</label>
          <select value={form.severity} onChange={(e) => set("severity", e.target.value)}>
            <option value="info">参考</option>
            <option value="warn">注意</option>
            <option value="error">重要</option>
          </select>

          <label>検出方法</label>
          <select value={form.detection_type} onChange={(e) => set("detection_type", e.target.value)}>
            <option value="exact">完全一致（語句）</option>
            <option value="regex">正規表現</option>
          </select>

          {form.detection_type === "exact" ? (
            <>
              <label>対象語 *</label>
              <input value={form.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="複数は ; で区切る（例：まず最初に;各々）" />
            </>
          ) : (
            <>
              <label>正規表現 *</label>
              <input value={form.pattern} onChange={(e) => set("pattern", e.target.value)} placeholder="例：(very|really)\\s" />
            </>
          )}

          <label>改善案</label>
          <input value={form.recommended_word} onChange={(e) => set("recommended_word", e.target.value)} placeholder="例：最初に" />

          <label>推奨コメント</label>
          <input value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="例：意味が重複しています" />

          <label>補足説明</label>
          <textarea value={form.explanation} onChange={(e) => set("explanation", e.target.value)} rows={2} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="hbtn primary" onClick={create}>
            このルールを追加
          </button>
        </div>
        <p className="admin-hint">追加後、利用者の校閲チェックに自動で反映されます（ページ再読み込み時）。</p>
      </section>

      <section className="admin-card">
        <h2>
          追加済みのカスタムルール <span className="admin-count">{rules.length}</span>
        </h2>
        {loading ? (
          <div className="empty small">読み込み中…</div>
        ) : rules.length === 0 ? (
          <div className="empty small">まだカスタムルールはありません。</div>
        ) : (
          <div className="rule-list">
            {rules.map((r) => (
              <div className={"rule-row" + (r.enabled ? "" : " off")} key={r.id}>
                <div className="rule-row-main">
                  <div className="rule-row-title">
                    {r.check_item}
                    <span className="rule-row-cat">{r.category}</span>
                  </div>
                  <div className="rule-row-sub">
                    {r.detection_type === "regex" ? "正規表現: " + r.pattern : "対象語: " + r.keyword}
                    {r.recommended_word && ` ／ 改善案: ${r.recommended_word}`}
                  </div>
                </div>
                <div className="rule-row-actions">
                  <button className="hbtn" onClick={() => toggle(r)}>
                    {r.enabled ? "有効" : "無効"}
                  </button>
                  <button className="admin-del" onClick={() => remove(r)}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
