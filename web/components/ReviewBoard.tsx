"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Comment = {
  id: string;
  author_name: string;
  quote: string;
  anchor_start: number;
  anchor_end: number;
  body: string;
  resolved: boolean;
  created_at: string;
};
type Share = { id: string; title: string; content: string; role: string; created_at: string };

export default function ReviewBoard({ token }: { token: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [author, setAuthor] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  // 選択範囲のコメント作成
  const [sel, setSel] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [draft, setDraft] = useState("");
  const docRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/review/${token}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setShare(data.share);
    setComments(data.comments || []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
    try {
      const saved = localStorage.getItem("review_author");
      if (saved) setAuthor(saved);
    } catch {}
  }, [load]);

  // 選択 → オフセット算出
  const onMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSel(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const root = docRef.current;
    if (!root || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSel(null);
      return;
    }
    const start = offsetOf(root, range.startContainer, range.startOffset);
    const end = offsetOf(root, range.endContainer, range.endOffset);
    const a = Math.min(start, end);
    const b = Math.max(start, end);
    if (b - a < 1) {
      setSel(null);
      return;
    }
    setSel({ start: a, end: b, quote: (share?.content || "").slice(a, b) });
  }, [share]);

  const submit = useCallback(async () => {
    if (!sel || !draft.trim()) return;
    try {
      localStorage.setItem("review_author", author);
    } catch {}
    const res = await fetch(`/api/review/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author,
        quote: sel.quote,
        anchor_start: sel.start,
        anchor_end: sel.end,
        body: draft,
      }),
    });
    const data = await res.json();
    if (data.comment) setComments((c) => [...c, data.comment]);
    setDraft("");
    setSel(null);
    window.getSelection()?.removeAllRanges();
  }, [sel, draft, author, token]);

  const toggleResolve = useCallback(
    async (c: Comment) => {
      setComments((list) =>
        list.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)),
      );
      await fetch(`/api/review/${token}/comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !c.resolved }),
      });
    },
    [token],
  );

  const focusComment = useCallback((c: Comment) => {
    setActiveId(c.id);
    const el = docRef.current?.querySelector<HTMLElement>(`mark[data-cid="${c.id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setActiveId(null), 1600);
  }, []);

  const nodes = useMemo(
    () => (share ? buildCommentNodes(share.content, comments, focusComment, activeId) : []),
    [share, comments, focusComment, activeId],
  );

  if (loading) return <div className="review-page"><div className="empty">読み込み中…</div></div>;
  if (notFound)
    return (
      <div className="review-page">
        <div className="empty">共有リンクが見つかりません。URL をご確認ください。</div>
      </div>
    );

  const openCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="review-page">
      <div className="review-top">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>{share?.title || "校閲レビュー"}</h1>
            <div className="sub">共有レビュー · 選択してコメント（赤入れ）できます</div>
          </div>
        </div>
        <div className="review-badge">未解決 {openCount} 件</div>
      </div>

      <div className="review-shell">
        <div className="review-doc-wrap">
          <div className="review-doc" ref={docRef} onMouseUp={onMouseUp}>
            {nodes}
          </div>
          {sel && (
            <div className="composer">
              <div className="composer-quote">「{sel.quote.slice(0, 40)}{sel.quote.length > 40 ? "…" : ""}」</div>
              <input
                className="composer-author"
                placeholder="お名前（任意）"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
              <textarea
                className="composer-body"
                placeholder="コメントを入力…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <div className="composer-actions">
                <button className="hbtn" onClick={() => { setSel(null); setDraft(""); }}>
                  キャンセル
                </button>
                <button className="hbtn primary" onClick={submit} disabled={!draft.trim()}>
                  赤入れする
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="review-side">
          <div className="side-head">コメント {comments.length} 件</div>
          {comments.length === 0 && (
            <div className="empty small">本文を選択してコメントを追加してください。</div>
          )}
          {comments.map((c) => (
            <div
              className={"cmt-card" + (c.resolved ? " resolved" : "") + (activeId === c.id ? " active" : "")}
              key={c.id}
              onClick={() => focusComment(c)}
            >
              <div className="cmt-quote">「{c.quote.slice(0, 30)}{c.quote.length > 30 ? "…" : ""}」</div>
              <div className="cmt-body">{c.body}</div>
              <div className="cmt-foot">
                <span className="cmt-author">{c.author_name}</span>
                <button
                  className="cmt-resolve"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleResolve(c);
                  }}
                >
                  {c.resolved ? "未解決に戻す" : "解決済みにする"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// root 配下で (node, offset) が示す位置の、root テキスト先頭からの文字オフセット
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) return total + offset;
    total += (n.nodeValue || "").length;
  }
  return total;
}

// コメントのアンカー範囲を本文へ重ねて <mark> 化（先勝ち）
function buildCommentNodes(
  text: string,
  comments: Comment[],
  onClick: (c: Comment) => void,
  activeId: string | null,
): React.ReactNode[] {
  const at: (Comment | null)[] = new Array(text.length + 1).fill(null);
  const sorted = [...comments].sort(
    (a, b) => a.anchor_end - a.anchor_start - (b.anchor_end - b.anchor_start),
  );
  sorted.forEach((c) => {
    for (let i = c.anchor_start; i < c.anchor_end && i < text.length; i++) {
      if (!at[i]) at[i] = c;
    }
  });

  const out: React.ReactNode[] = [];
  let pos = 0;
  let key = 0;
  while (pos < text.length) {
    const cur = at[pos];
    let end = pos + 1;
    while (end < text.length && at[end] === cur) end++;
    const seg = text.slice(pos, end);
    if (cur) {
      out.push(
        <mark
          key={key}
          className={
            "cmt" + (cur.resolved ? " resolved" : "") + (activeId === cur.id ? " active" : "")
          }
          data-cid={cur.id}
          onClick={() => onClick(cur)}
        >
          {seg}
        </mark>,
      );
    } else {
      out.push(<React.Fragment key={key}>{seg}</React.Fragment>);
    }
    pos = end;
    key++;
  }
  return out;
}
