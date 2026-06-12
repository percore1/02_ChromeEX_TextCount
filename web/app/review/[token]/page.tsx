import { isSupabaseConfigured } from "@/lib/supabase/config";
import ReviewBoard from "@/components/ReviewBoard";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isSupabaseConfigured) {
    return (
      <div className="review-page">
        <div className="empty">この共有リンクはまだ利用できません（バックエンド未設定）。</div>
      </div>
    );
  }

  return <ReviewBoard token={token} />;
}
