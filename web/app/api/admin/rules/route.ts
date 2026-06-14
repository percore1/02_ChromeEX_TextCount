import { NextResponse, type NextRequest } from "next/server";
import { getStaffContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// カスタムルール一覧（staff以上）
export async function GET() {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proofread_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
}

// カスタムルール作成（staff以上）
export async function POST(request: NextRequest) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const check_item = String(body.check_item || "").trim();
  if (!check_item) return NextResponse.json({ error: "title_required" }, { status: 400 });
  const detection_type = body.detection_type === "regex" ? "regex" : "exact";
  if (detection_type === "exact" && !String(body.keyword || "").trim())
    return NextResponse.json({ error: "keyword_required" }, { status: 400 });
  if (detection_type === "regex" && !String(body.pattern || "").trim())
    return NextResponse.json({ error: "pattern_required" }, { status: 400 });

  const row = {
    category: String(body.category || "").trim() || "カスタム",
    check_item,
    severity: ["info", "warn", "error"].includes(body.severity) ? body.severity : "info",
    detection_type,
    keyword: detection_type === "exact" ? String(body.keyword || "").trim() : null,
    pattern: detection_type === "regex" ? String(body.pattern || "").trim() : null,
    recommended_word: String(body.recommended_word || "").trim() || null,
    message: String(body.message || "").trim() || null,
    explanation: String(body.explanation || "").trim() || null,
    created_by: ctx.user.id,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proofread_rules")
    .insert(row)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
