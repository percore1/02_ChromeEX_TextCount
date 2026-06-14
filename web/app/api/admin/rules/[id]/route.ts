import { NextResponse, type NextRequest } from "next/server";
import { getStaffContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 有効/無効の切替・編集（staff以上）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const update: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  for (const k of ["category", "check_item", "severity", "keyword", "pattern", "recommended_word", "message", "explanation"]) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "no_fields" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("proofread_rules").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 削除（staff以上）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from("proofread_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
