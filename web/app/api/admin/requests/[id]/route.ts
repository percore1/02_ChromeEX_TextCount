import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getStaffContext, isAdminConfigured } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function genPassword(): string {
  return randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) + "1a";
}

// 申請を承認（アカウント発行）または却下
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAdminConfigured)
    return NextResponse.json({ error: "service_role_unset" }, { status: 503 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("access_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (!req) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.action === "reject") {
    await admin
      .from("access_requests")
      .update({ status: "rejected", reviewed_by: ctx.user.id })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // approve: アカウント発行
  const password = genPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: req.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: req.name || undefined },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin
    .from("profiles")
    .update({ plan: "contract_free", status: "active" })
    .eq("id", data.user.id);
  await admin
    .from("access_requests")
    .update({ status: "approved", reviewed_by: ctx.user.id })
    .eq("id", id);

  return NextResponse.json({ ok: true, email: req.email, password });
}
