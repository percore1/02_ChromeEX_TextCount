import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// 共有スナップショット＋コメント取得（トークン経由・未ログイン可）
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseConfigured)
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });
  const { token } = await params;
  const supabase = await createClient();

  const { data: shareRows, error: shareErr } = await supabase.rpc("get_share", {
    p_token: token,
  });
  if (shareErr) return NextResponse.json({ error: shareErr.message }, { status: 500 });
  const share = Array.isArray(shareRows) ? shareRows[0] : shareRows;
  if (!share) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: comments } = await supabase.rpc("list_comments", { p_token: token });

  return NextResponse.json({ share, comments: comments || [] });
}
