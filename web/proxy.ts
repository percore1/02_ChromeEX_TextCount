// Next.js 16: middleware は proxy に名称変更。セッション更新＋ルート保護を行う。
// Supabase 未設定（環境変数なし）の場合は何もせずゲストモードで通す。
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
    path.startsWith("/review") ||
    path.startsWith("/api/review") ||
    path.startsWith("/request-access") ||
    path.startsWith("/api/request-access");

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

  return response;
}

export const config = {
  // 静的アセット・ルールJSONは除外
  matcher: ["/((?!_next/static|_next/image|favicon.ico|data/|.*\\.svg$).*)"],
};
