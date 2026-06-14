import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// 全ログインユーザー向け：有効なカスタムルールを text_checklist.json と同じ生スキーマで返す。
// （校閲エンジンと /rules 一覧画面が静的ルールにマージして使う）
export async function GET() {
  if (!isSupabaseConfigured) return NextResponse.json({ rules: [] });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ rules: [] });

  const { data, error } = await supabase
    .from("proofread_rules")
    .select("*")
    .eq("enabled", true)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ rules: [] });

  const rules = (data || []).map((r) => ({
    id: "custom-" + r.id,
    category: r.category,
    check_item: r.check_item,
    severity: r.severity,
    detection_type: r.detection_type,
    keyword: r.keyword || "",
    pattern: r.pattern || "",
    recommended_word: r.recommended_word || "",
    basic_comment_preview: r.message || "",
    explanation: r.explanation || "",
    source_tab: r.source_tab || "カスタム",
    auto_detectable: true,
    enabled: true,
  }));
  return NextResponse.json({ rules });
}
