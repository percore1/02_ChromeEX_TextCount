import { NextResponse, type NextRequest } from "next/server";
import { isStripeConfigured, getStripe } from "@/lib/stripe";
import { getAuthState } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe カスタマーポータル（解約・カード変更）
export async function POST(request: NextRequest) {
  if (!isStripeConfigured)
    return NextResponse.json({ error: "stripe_unset" }, { status: 503 });
  const { user } = await getAuthState();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = isAdminConfigured ? createAdminClient() : null;
  let customerId: string | null = null;
  if (admin) {
    const { data } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    customerId = (data?.stripe_customer_id as string) || null;
  }
  if (!customerId) return NextResponse.json({ error: "no_customer" }, { status: 400 });

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${request.nextUrl.origin}/`,
  });
  return NextResponse.json({ url: session.url });
}
