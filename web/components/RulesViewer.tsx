"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadRules, groupByCategory, type Rule } from "@/lib/proofreading";

const SEV_LABEL: Record<string, string> = { error: "重要", warn: "注意", info: "参考" };
const DET_LABEL: Record<string, string> = {
  exact: "完全一致",
  dictionary: "辞書",
  regex: "正規表現",
  sentence_metric: "文の長さ等",
  sequence: "連続・重複",
  heuristic: "推定",
  manual: "手動チェック",
};

export default function RulesViewer({ isStaff }: { isStaff: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  useEffect(() => {
    loadRules().then(setRules);
  }, []);

  const categories = useMemo(() => {
    if (!rules) return [];
    return Array.from(new Set(rules.map((r) => r.category))).sort();
  }, [rules]);

  const filtered = useMemo(() => {
    if (!rules) return [];
    const kw = q.trim();
    return rules.filter((r) => {
      if (cat && r.category !== cat) return false;
      if (!kw) return true;
      return (
        r.title.includes(kw) ||
        r.category.includes(kw) ||
        (r.keyword || "").includes(kw) ||
        (r.recommended || "").includes(kw) ||
        (r.description || "").includes(kw)
      );
    });
  }, [rules, q, cat]);

  const groups = groupByCategory(filtered, (r) => r.category);

  return (
    <div className="rules-page">
      <div className="rules-top">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>校閲ルール一覧</h1>
            <div className="sub">
              {rules ? `${rules.length} 件のルール` : "読み込み中…"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isStaff && (
            <Link className="tb-file" href="/admin/rules">
              ルールを追加・管理
            </Link>
          )}
          <Link className="tb-file" href="/">
            ← ツールに戻る
          </Link>
        </div>
      </div>

      <div className="rules-filter">
        <input
          placeholder="キーワードで検索（ルール名・対象語・カテゴリ）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">すべてのカテゴリ</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="rules-hit">{filtered.length} 件</span>
      </div>

      {!rules ? (
        <div className="empty">読み込み中…</div>
      ) : (
        groups.map((g) => (
          <div className="rules-cat" key={g.category}>
            <div className="rules-cat-title">
              {g.category} <span>{g.items.length}</span>
            </div>
            {g.items.map((r) => (
              <div className="rules-item" key={r.id}>
                <div className="rules-item-head">
                  <span className={"sev sev-" + r.severity}>
                    {SEV_LABEL[r.severity] || r.severity}
                  </span>
                  <span className="rules-det">{DET_LABEL[r.detectionType] || r.detectionType}</span>
                  {r.sourceTab === "カスタム" && <span className="rules-custom">カスタム</span>}
                  <span className="rules-title">{r.title}</span>
                </div>
                {r.keyword && <div className="rules-kw">対象語：{r.keyword}</div>}
                {r.recommended && (
                  <div className="rules-rec">
                    改善案：<b>{r.recommended}</b>
                  </div>
                )}
                {r.description && <div className="rules-desc">{r.description}</div>}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
