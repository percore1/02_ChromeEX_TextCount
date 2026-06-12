// Supabase の環境変数。未設定の場合はゲストモード（認証・履歴オフ）で動作する。
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// サーバー専用。管理操作（auth.admin 等）で使用。NEXT_PUBLIC_ は付けない。
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const isAdminConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
