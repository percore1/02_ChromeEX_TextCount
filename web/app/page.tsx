import TextCountTool from "@/components/TextCountTool";
import { getAuthState } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ load?: string }>;
}) {
  const { authEnabled, user, profile } = await getAuthState();
  const sp = await searchParams;

  let initialText = "";
  if (authEnabled && user && sp.load) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("proofread_history")
      .select("content")
      .eq("id", sp.load)
      .single();
    if (data?.content) initialText = data.content as string;
  }

  return (
    <TextCountTool
      authEnabled={authEnabled && isSupabaseConfigured}
      userEmail={user?.email ?? null}
      appRole={profile?.app_role ?? null}
      initialText={initialText}
    />
  );
}
