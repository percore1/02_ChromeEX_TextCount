import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/auth";
import { isSupabaseConfigured, isAdminConfigured } from "@/lib/supabase/config";
import AdminPanel from "@/components/AdminPanel";

export default async function AdminPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="admin-page">
        <div className="empty">認証が未設定です。</div>
      </div>
    );
  }
  const ctx = await getStaffContext();
  if (!ctx) redirect("/"); // 未ログイン or 権限なし

  return (
    <AdminPanel
      role={ctx.profile.app_role}
      selfId={ctx.user.id}
      selfEmail={ctx.user.email}
      adminConfigured={isAdminConfigured}
    />
  );
}
