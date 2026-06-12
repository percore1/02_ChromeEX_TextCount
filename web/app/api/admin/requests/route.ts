import { NextResponse } from "next/server";
import { getStaffContext, isAdminConfigured } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// 利用申請の一覧
export async function GET() {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAdminConfigured)
    return NextResponse.json({ error: "service_role_unset" }, { status: 503 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("access_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}
