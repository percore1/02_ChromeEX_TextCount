import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// コメント（赤入れ）を追加
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseConfigured)
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("add_comment", {
    p_token: token,
    p_author: String(body.author || "匿名"),
    p_quote: String(body.quote || ""),
    p_start: Number(body.anchor_start) || 0,
    p_end: Number(body.anchor_end) || 0,
    p_body: String(body.body || ""),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ comment: Array.isArray(data) ? data[0] : data });
}
