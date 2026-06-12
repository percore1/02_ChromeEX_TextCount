import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// 履歴一覧
export async function GET() {
  if (!isSupabaseConfigured)
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("proofread_history")
    .select("id,title,counted_length,detection_count,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// 履歴保存
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured)
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const content = String(body.content || "");
  const firstLine = content.split("\n")[0]?.trim() || "無題";

  const row = {
    user_id: user.id,
    title: firstLine.slice(0, 60) || "無題",
    content,
    counted_length: Number(body.counted_length) || 0,
    original_count: Number(body.original_count) || 0,
    excluded_count: Number(body.excluded_count) || 0,
    detection_count: Number(body.detection_count) || 0,
    kanji_ratio: Number(body.kanji_ratio) || 0,
  };

  const { data, error } = await supabase
    .from("proofread_history")
    .insert(row)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
