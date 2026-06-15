import { NextResponse, type NextRequest } from "next/server";
import { isStripeConfigured, getStripe, STRIPE_PRICE_ID } from "@/lib/stripe";
import { getAuthState } from "@/lib/auth";
import { isAdminConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

// 月額サブスクの Checkout セッションを作成
export async function POST(request: NextRequest) {
  if (!isStripeConfigured)
    return NextResponse.json({ error: "stripe_unset" }, { status: 503 });
  const { user } = await getAuthState();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stripe = getStripe();
  const admin = isAdminConfigured ? createAdminClient() : null;

  // 既存の Stripe 顧客IDを再利用、無ければ作成
  let customerId: string | null = null;
  if (admin) {
    const { data } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    customerId = (data?.stripe_customer_id as string) || null;
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_id: user.id },
    });
    customerId = customer.id;
    if (admin)
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const origin = request.nextUrl.origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/billing`,
    client_reference_id: user.id,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
