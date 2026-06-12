import { isSupabaseConfigured } from "./supabase/config";
import { createClient } from "./supabase/server";

export type AuthState = {
  authEnabled: boolean;
  user: { id: string; email: string } | null;
};

// サーバー側で現在の認証状態を取得する。Supabase 未設定時はゲスト（authEnabled=false）。
export async function getAuthState(): Promise<AuthState> {
  if (!isSupabaseConfigured) return { authEnabled: false, user: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return {
    authEnabled: true,
    user: user ? { id: user.id, email: user.email || "" } : null,
  };
}
