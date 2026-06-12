import { NextResponse, type NextRequest } from "next/server";
import { getStaffContext, isAdminConfigured } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// 会員の状態・プラン・権限を更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAdminConfigured)
    return NextResponse.json({ error: "service_role_unset" }, { status: 503 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const update: Record<string, string> = {};
  if (["pending", "active", "suspended"].includes(body.status)) update.status = body.status;
  if (["contract_free", "paid", "none"].includes(body.plan)) update.plan = body.plan;
  // 権限変更は admin のみ
  if (body.app_role !== undefined) {
    if (ctx.profile.app_role !== "admin")
      return NextResponse.json({ error: "admin_only_role" }, { status: 403 });
    if (["admin", "staff", "member"].includes(body.app_role)) update.app_role = body.app_role;
  }
  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "no_fields" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 会員を削除（admin のみ）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (ctx.profile.app_role !== "admin")
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  if (!isAdminConfigured)
    return NextResponse.json({ error: "service_role_unset" }, { status: 503 });

  const { id } = await params;
  if (id === ctx.user.id)
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
