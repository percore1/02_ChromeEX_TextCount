"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  title: string;
  counted_length: number;
  detection_count: number;
  created_at: string;
};

export default function HistoryList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [list, setList] = useState(items);

  async function remove(id: string) {
    setList((l) => l.filter((x) => x.id !== id));
    await fetch(`/api/history/${id}`, { method: "DELETE" });
  }

  if (list.length === 0) {
    return <div className="empty">保存された校閲履歴はありません。</div>;
  }

  return (
    <div className="history-grid">
      {list.map((it) => (
        <div className="history-card" key={it.id}>
          <div className="history-title">{it.title || "無題"}</div>
          <div className="history-meta">
            <span>{it.counted_length.toLocaleString()} 文字</span>
            <span className="dot-sep" />
            <span>検出 {it.detection_count} 件</span>
          </div>
          <div className="history-date">
            {new Date(it.created_at).toLocaleString("ja-JP")}
          </div>
          <div className="history-actions">
            <button
              className="hbtn primary"
              onClick={() => router.push(`/?load=${it.id}`)}
            >
              開く
            </button>
            <button className="hbtn" onClick={() => remove(it.id)}>
              削除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
