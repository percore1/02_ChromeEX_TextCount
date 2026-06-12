import { isSupabaseConfigured, isAdminConfigured } from "./supabase/config";
import { createClient } from "./supabase/server";

export type Profile = {
  app_role: "admin" | "staff" | "member";
  status: "pending" | "active" | "suspended";
  plan: "contract_free" | "paid" | "none";
  display_name: string | null;
  member_code: string | null;
};

export type AuthState = {
  authEnabled: boolean;
  user: { id: string; email: string } | null;
  profile: Profile | null;
};

// サーバー側で現在の認証状態＋会員プロフィールを取得する。Supabase 未設定時はゲスト。
export async function getAuthState(): Promise<AuthState> {
  if (!isSupabaseConfigured) return { authEnabled: false, user: null, profile: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { authEnabled: true, user: null, profile: null };

  let profile: Profile | null = null;
  const { data } = await supabase
    .from("profiles")
    .select("app_role,status,plan,display_name,member_code")
    .eq("id", user.id)
    .single();
  if (data) profile = data as Profile;

  return {
    authEnabled: true,
    user: { id: user.id, email: user.email || "" },
    profile,
  };
}

export function isStaffRole(role?: string | null): boolean {
  return role === "admin" || role === "staff";
}

// 管理画面・管理APIのガード。staff以上でなければ null を返す。
export async function getStaffContext(): Promise<{
  user: { id: string; email: string };
  profile: Profile;
} | null> {
  if (!isSupabaseConfigured) return null;
  const { user, profile } = await getAuthState();
  if (!user || !profile || !isStaffRole(profile.app_role)) return null;
  return { user, profile };
}

export { isAdminConfigured };
