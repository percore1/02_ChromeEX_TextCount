import { redirect } from "next/navigation";
import { getStaffContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import RulesAdmin from "@/components/RulesAdmin";

export default async function AdminRulesPage() {
  if (!isSupabaseConfigured) {
    return (
      <div className="admin-page">
        <div className="empty">認証が未設定です。</div>
      </div>
    );
  }
  const ctx = await getStaffContext();
  if (!ctx) redirect("/");
  return <RulesAdmin selfEmail={ctx.user.email} />;
}
