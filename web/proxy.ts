// Next.js 16: middleware は proxy に名称変更。セッション更新＋ルート保護を行う。
// Supabase 未設定（環境変数なし）の場合は何もせずゲストモードで通す。
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEntitled } from "@/lib/entitlement";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function proxy(request: NextRequest) {
  // 未設定ならゲストモード（全ページ公開）
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // 公開ルート：ログイン・認証・共有レビュー（レビュアーは未ログイン）
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/review") ||
    path.startsWith("/api/review") ||
    path.startsWith("/request-access") ||
    path.startsWith("/api/request-access") ||
    path.startsWith("/api/stripe/webhook");

  // 未ログイン → ログインへ
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // ログイン済みでログイン画面に来たらツールへ
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // 利用ゲート（5b）：ログイン済み会員が「利用可」でなければ /billing へ。
  // admin/staff は素通り。/billing・/account・/admin・/api・公開ルートは対象外。
  if (user) {
    const exempt =
      isPublic ||
      path.startsWith("/billing") ||
      path.startsWith("/account") ||
      path.startsWith("/admin") ||
      path.startsWith("/api");
    if (!exempt) {
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("app_role,status,plan,subscription_status")
        .eq("id", user.id)
        .single();
      // 判定できた場合のみブロック（エラー時は可用性優先で通す）
      if (!pErr && prof && !isEntitled(prof)) {
        const url = request.nextUrl.clone();
        url.pathname = "/billing";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  // 静的アセット・ルールJSONは除外
  matcher: ["/((?!_next/static|_next/image|favicon.ico|data/|.*\\.svg$).*)"],
};
