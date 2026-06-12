import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// 共有URL（提出）を発行
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

  const { data, error } = await supabase
    .from("shares")
    .insert({
      owner_id: user.id,
      title: firstLine.slice(0, 60) || "無題",
      content,
      role: String(body.role || "director"),
    })
    .select("token")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = request.nextUrl.origin;
  return NextResponse.json({
    token: data.token,
    url: `${origin}/review/${data.token}`,
  });
}
