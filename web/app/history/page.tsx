import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import HistoryList from "@/components/HistoryList";

export default async function HistoryPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="history-page">
        <div className="empty">認証が未設定のため履歴は利用できません。</div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("proofread_history")
    .select("id,title,counted_length,detection_count,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="history-page">
      <div className="history-top">
        <div className="brand">
          <div className="seal">朱</div>
          <div>
            <h1>校閲履歴</h1>
            <div className="sub">{user.email}</div>
          </div>
        </div>
        <Link className="tb-file" href="/">
          ← ツールに戻る
        </Link>
      </div>
      <HistoryList items={data || []} />
    </div>
  );
}
