import Stripe from "stripe";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { transitionOrder } from "../orders/order-service.js";

export const stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2024-10-28.acacia" });

export async function createPaymentIntent(orderId: string, idempotencyKey: string) {
  const { rows, rowCount } = await pool.query("select id, total_pence from orders where id = $1", [orderId]);
  if (!rowCount) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  const intent = await stripe.paymentIntents.create(
    {
      amount: rows[0].total_pence,
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: { orderId }
    },
    { idempotencyKey }
  );

  await pool.query(
    `insert into payments (order_id, provider, provider_payment_intent_id, status, amount_pence, currency)
     values ($1,'stripe',$2,$3,$4,'GBP')
     on conflict (provider_payment_intent_id) do update set status = excluded.status, updated_at = now()`,
    [orderId, intent.id, intent.status, intent.amount]
  );
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!signature) throw Object.assign(new Error("Missing Stripe signature"), { statusCode: 400 });
  const event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  await pool.query(
    `insert into idempotency_keys (key, scope, response_body) values ($1,'stripe.webhook',$2)
     on conflict (key) do nothing`,
    [event.id, { received: true }]
  );

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.orderId;
    await pool.query("update payments set status = 'succeeded', updated_at = now() where provider_payment_intent_id = $1", [intent.id]);
    await transitionOrder(orderId, "paid", "stripe_webhook");
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    await pool.query("update payments set status = 'failed', updated_at = now() where provider_payment_intent_id = $1", [intent.id]);
    await transitionOrder(intent.metadata.orderId, "failed", "stripe_webhook");
  }

  return { received: true };
}
