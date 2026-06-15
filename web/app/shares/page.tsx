import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SharesList from "@/components/SharesList";

export default async function SharesPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="history-page">
        <div className="empty">認証が未設定のため共有一覧は利用できません。</div>
      </div>
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: shares, error } = await supabase
    .from("shares")
    .select("id,title,token,created_at,revoked")
    .order("created_at", { ascending: false })
    .limit(200);

  // revoked 列が未作成（マイグレーション未実行）の場合の案内
  if (error) {
    return (
      <div className="history-page">
        <div className="history-top">
          <div className="brand">
            <div className="seal">朱</div>
            <div>
              <h1>共有一覧</h1>
              <div className="sub">提出した共有URLの管理・失効</div>
            </div>
          </div>
          <Link className="tb-file" href="/">
            ← ツールに戻る
          </Link>
        </div>
        <div className="empty">
          共有の失効機能を使うには、Supabase で <code>web/supabase/phase5d-share-revoke.sql</code> を実行してください。
        </div>
      </div>
    );
  }

  const ids = (shares || []).map((s) => s.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: comments } = await supabase
      .from("comments")
      .select("share_id")
      .in("share_id", ids);
    (comments || []).forEach((c) => counts.set(c.share_id, (counts.get(c.share_id) || 0) + 1));
  }
  const items = (shares || []).map((s) => ({ ...s, comment_count: counts.get(s.id) || 0 }));

  return (
    <div className="history-page">
      <div className="history-top">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>共有一覧</h1>
            <div className="sub">提出した共有URLの管理・失効</div>
          </div>
        </div>
        <Link className="tb-file" href="/">
          ← ツールに戻る
        </Link>
      </div>
      <SharesList items={items} />
    </div>
  );
}
