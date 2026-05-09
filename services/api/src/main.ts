import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyRawBody from "fastify-raw-body";
import { z } from "zod";
import { InvalidOrderTransitionError, ORDER_STATUSES } from "@marsh-eats/shared";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { createPendingOrder, transitionOrder } from "./orders/order-service.js";
import { createPaymentIntent, handleStripeWebhook } from "./payments/stripe-service.js";
import { credentialsSchema, login, registerCustomer, verifyToken, signToken } from "./auth-service.js";
import { registerRealtimeRoutes } from "./realtime/sse.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
await app.register(cors, { origin: true, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await app.register(fastifyRawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error instanceof InvalidOrderTransitionError ? 409 : Number((error as Error & { statusCode?: number }).statusCode ?? 500);
  reply.status(statusCode).send({ error: error.message, statusCode });
});


app.post("/api/v1/auth/register", async (request) => {
  const body = credentialsSchema.extend({ fullName: z.string().min(1), phone: z.string().optional() }).parse(request.body);
  return registerCustomer(body);
});

app.post("/api/v1/auth/login", async (request) => {
  const body = credentialsSchema.parse(request.body);
  return login(body);
});

app.post("/api/v1/auth/logout", async () => ({ ok: true }));

app.post("/api/v1/auth/refresh", async (request) => {
  const body = z.object({ accessToken: z.string().min(20) }).parse(request.body);
  const payload = verifyToken(body.accessToken);
  return { accessToken: signToken({ sub: payload.sub, role: payload.role, email: payload.email }) };
});

app.get("/api/v1/auth/me", async (request) => {
  const header = request.headers.authorization ?? "";
  const payload = verifyToken(header.replace(/^Bearer\s+/i, ""));
  const { rows, rowCount } = await pool.query("select id, email, full_name, role from users where id = $1 and deleted_at is null", [payload.sub]);
  if (!rowCount) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  return { user: rows[0] };
});

app.post("/api/v1/auth/password-reset/request", async (request) => {
  const body = z.object({ email: z.string().email() }).parse(request.body);
  await pool.query("insert into audit_log (actor_type, action, entity_type, metadata) values ('anonymous','password_reset.requested','user',$1)", [{ email: body.email.toLowerCase() }]);
  return { ok: true };
});

app.post("/api/v1/auth/password-reset/confirm", async (request) => {
  const body = z.object({ email: z.string().email(), auditApprovedToken: z.string().min(12), newPassword: z.string().min(12) }).parse(request.body);
  await pool.query("insert into audit_log (actor_type, action, entity_type, metadata) values ('support','password_reset.confirmed','user',$1)", [{ email: body.email.toLowerCase(), tokenSuffix: body.auditApprovedToken.slice(-4) }]);
  return { ok: true };
});

app.get("/health", async () => {
  await pool.query("select 1");
  return { ok: true, service: "marsh-eats-api" };
});

app.get("/api/v1/restaurants", async () => {
  const { rows } = await pool.query(
    `select id, name, slug, cuisine_types, minimum_order_pence, collection_enabled, delivery_enabled
     from restaurants where status = 'active' and deleted_at is null order by name limit 100`
  );
  return { restaurants: rows };
});

app.get("/api/v1/restaurants/:id/menu", async (request) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const { rows } = await pool.query(
    `select c.id category_id, c.name category_name, i.id item_id, i.name, i.description, i.price_pence, i.allergens
     from menus m join menu_categories c on c.menu_id = m.id join menu_items i on i.category_id = c.id
     where m.restaurant_id = $1 and m.is_active = true and i.is_available = true and i.deleted_at is null
     order by c.sort_order, i.sort_order`,
    [params.id]
  );
  return { items: rows };
});

app.post("/api/v1/orders", async (request) => {
  const body = z.object({
    customerId: z.string().uuid(),
    restaurantId: z.string().uuid(),
    fulfilmentType: z.enum(["delivery", "collection"]),
    deliveryAddressId: z.string().uuid().optional(),
    idempotencyKey: z.string().min(8),
    items: z.array(z.object({
      menuItemId: z.string().uuid(),
      quantity: z.number().int().positive().max(99),
      name: z.string().min(1).optional(),
      unitPricePence: z.number().int().nonnegative().optional(),
      allergens: z.array(z.string()).optional(),
      modifiers: z.array(z.unknown()).optional()
    })).min(1)
  }).parse(request.body);
  return createPendingOrder(body);
});

app.post("/api/v1/orders/:id/payment-intents", async (request) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({ idempotencyKey: z.string().min(8) }).parse(request.body);
  return createPaymentIntent(params.id, body.idempotencyKey);
});

app.patch("/api/v1/orders/:id/status", async (request) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({ status: z.enum(ORDER_STATUSES), actor: z.enum(["restaurant", "admin", "support"]), actorUserId: z.string().uuid().optional() }).parse(request.body);
  return transitionOrder(params.id, body.status, body.actor, body.actorUserId);
});

app.post("/api/v1/stripe/webhook", { config: { rawBody: true } }, async (request) => {
  const raw = (request as typeof request & { rawBody?: Buffer }).rawBody;
  if (!raw) throw Object.assign(new Error("Missing raw webhook body"), { statusCode: 400 });
  return handleStripeWebhook(raw, request.headers["stripe-signature"] as string | undefined);
});

registerRealtimeRoutes(app);

await app.listen({ port: config.PORT, host: "0.0.0.0" });
