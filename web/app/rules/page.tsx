import { getAuthState, isStaffRole } from "@/lib/auth";
import RulesViewer from "@/components/RulesViewer";

export default async function RulesPage() {
  const { profile } = await getAuthState();
  return <RulesViewer isStaff={isStaffRole(profile?.app_role)} />;
}
