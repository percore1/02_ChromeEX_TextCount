import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// コメントの解決状態を更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  if (!isSupabaseConfigured)
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });
  const { token, id } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_comment_resolved", {
    p_token: token,
    p_comment: id,
    p_resolved: Boolean(body.resolved),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
