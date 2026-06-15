import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { isStripeConfigured, getStripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { isAdminConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe Webhook：サブスク状態を profiles に反映
export async function POST(request: NextRequest) {
  if (!isStripeConfigured || !isAdminConfigured)
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  const sig = request.headers.get("stripe-signature");
  const body = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig || "", STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    return NextResponse.json({ error: "invalid_signature: " + e.message }, { status: 400 });
  }

  const admin = createAdminClient();

  async function syncByCustomer(customerId: string, sub: Stripe.Subscription | null) {
    const status = sub?.status ?? "canceled";
    const periodEnd = sub?.items?.data?.[0]?.current_period_end
      ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
      : null;
    const plan = status === "active" || status === "trialing" ? "paid" : "none";
    await admin
      .from("profiles")
      .update({ subscription_status: status, plan, current_period_end: periodEnd })
      .eq("stripe_customer_id", customerId);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const customerId = s.customer as string;
        const subId = s.subscription as string;
        const sub = subId ? await stripe.subscriptions.retrieve(subId) : null;
        await syncByCustomer(customerId, sub);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await syncByCustomer(sub.customer as string, sub);
        break;
      }
      default:
        break;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
