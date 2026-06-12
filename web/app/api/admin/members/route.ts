import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getStaffContext, isAdminConfigured } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function genPassword(): string {
  return randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) + "1a";
}

// 会員一覧（auth.users のメール ＋ profiles の状態を結合）
export async function GET() {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAdminConfigured)
    return NextResponse.json({ error: "service_role_unset" }, { status: 503 });

  const admin = createAdminClient();
  const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,app_role,status,plan,display_name,member_code");
  const pmap = new Map((profiles || []).map((p) => [p.id, p]));

  const members = list.users.map((u) => {
    const p = pmap.get(u.id) || {};
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      app_role: (p as any).app_role || "member",
      status: (p as any).status || "active",
      plan: (p as any).plan || "none",
      display_name: (p as any).display_name || null,
      member_code: (p as any).member_code || null,
    };
  });
  members.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return NextResponse.json({ members });
}

// 会員を発行（パスワード指定 or 自動生成）
export async function POST(request: NextRequest) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAdminConfigured)
    return NextResponse.json({ error: "service_role_unset" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  const password = String(body.password || "") || genPassword();
  const plan = ["contract_free", "paid", "none"].includes(body.plan) ? body.plan : "contract_free";
  // app_role の付与は admin のみ。staff は member 固定。
  const reqRole = ["admin", "staff", "member"].includes(body.app_role) ? body.app_role : "member";
  const app_role = ctx.profile.app_role === "admin" ? reqRole : "member";

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name || undefined,
      member_code: body.member_code || undefined,
    },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // トリガで作られた profile を更新
  await admin
    .from("profiles")
    .update({ plan, app_role, status: "active" })
    .eq("id", data.user.id);

  return NextResponse.json({ id: data.user.id, email, password });
}
