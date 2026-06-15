import "server-only";
import Stripe from "stripe";

// サーバー専用。Stripe 未設定でもアプリは動く（課金機能のみ無効）。
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";

export const isStripeConfigured = Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_ID);

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(STRIPE_SECRET_KEY);
  return _stripe;
}
