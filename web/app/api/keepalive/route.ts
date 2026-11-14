import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

// Supabase 無料プランの「使われていないので休止」を防ぐための口（2026-11-14）。
// Vercel Cron（web/vercel.json）が1日1回呼び、DB に軽いクエリを1本流す。
// 返すのは ok だけ（会員数などの中身は返さない）。
// CRON_SECRET が Vercel に設定されていれば、Vercel Cron が付ける Authorization ヘッダーを確かめる。
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!isSupabaseConfigured) return NextResponse.json({ ok: false, reason: "unconfigured" });

  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  const supabase = createSupabaseClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // head: true＝行は取らずに DB へ問い合わせだけを行う
  const { error } = await supabase
    .from("profiles")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (error) {
    console.error("[keepalive] supabase query failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
