import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// 公開：利用申請の受付（未ログイン可）
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured)
    return NextResponse.json({ error: "auth_disabled" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("access_requests").insert({
    email,
    name: String(body.name || "").slice(0, 80) || null,
    company: String(body.company || "").slice(0, 120) || null,
    message: String(body.message || "").slice(0, 1000) || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
