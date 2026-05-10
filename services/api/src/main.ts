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
import { credentialsSchema, login, registerCustomer, verifyToken, signToken, requireAuth } from "./auth-service.js";
import { registerRealtimeRoutes } from "./realtime/sse.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
await app.register(cors, { origin: true, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await app.register(fastifyRawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error instanceof InvalidOrderTransitionError ? 409 : Number((error as Error & { statusCode?: number }).statusCode ?? 500);
  reply.status(statusCode).send({ error: error instanceof Error ? error.message : "Unknown error", statusCode });
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

const restaurantParams = z.object({ id: z.string().uuid() });
const adminRestaurantBody = z.object({
  ownerUserId: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  status: z.enum(["draft", "pending_review", "active", "suspended", "closed"]).default("draft"),
  cuisineTypes: z.array(z.string().min(1)).default([]),
  description: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  town: z.string().min(1),
  county: z.string().optional(),
  postcode: z.string().min(3),
  minimumOrderPence: z.number().int().nonnegative().default(0),
  collectionEnabled: z.boolean().default(true),
  deliveryEnabled: z.boolean().default(true),
  isAcceptingOrders: z.boolean().default(false),
  logoUrl: z.string().url().optional(),
  estimatedPrepMinutes: z.number().int().positive().default(30)
});

function toRestaurant(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    cuisine: Array.isArray(row.cuisine_types) ? row.cuisine_types[0] ?? "Local" : "Local",
    cuisineTypes: row.cuisine_types,
    description: row.description,
    address: row.address_line1 ? `${row.address_line1}, ${row.town}` : row.town,
    town: row.town,
    logoUrl: row.logo_url,
    status: row.status,
    isActive: row.status === "active",
    isAcceptingOrders: row.is_accepting_orders,
    collectionEnabled: row.collection_enabled,
    deliveryEnabled: row.delivery_enabled,
    minimumOrderPence: row.minimum_order_pence,
    estimatedPrepMinutes: row.estimated_prep_minutes
  };
}

async function assertRestaurantAccess(userId: string, role: string, restaurantId: string) {
  if (role === "admin") return;
  const access = await pool.query(
    "select 1 from restaurant_staff_members where restaurant_id = $1 and user_id = $2",
    [restaurantId, userId]
  );
  if (!access.rowCount) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
}

app.get("/api/v1/restaurants", async (request) => {
  const query = z.object({ includeInactive: z.coerce.boolean().optional() }).parse(request.query);
  const includeInactive = query.includeInactive === true;
  if (includeInactive) requireAuth(request, ["admin"]);
  const { rows } = await pool.query(
    `select id, name, slug, cuisine_types, description, address_line1, town, logo_url, status, is_accepting_orders,
      minimum_order_pence, collection_enabled, delivery_enabled, estimated_prep_minutes
     from restaurants
     where deleted_at is null and ($1::boolean or (status = 'active' and is_accepting_orders = true))
     order by name limit 100`,
    [includeInactive]
  );
  return { restaurants: rows.map(toRestaurant) };
});

app.get("/api/v1/restaurants/:id/menu", async (request) => {
  const params = restaurantParams.parse(request.params);
  const restaurant = await pool.query("select id, name, status from restaurants where id = $1 and deleted_at is null", [params.id]);
  if (!restaurant.rowCount) throw Object.assign(new Error("Restaurant not found"), { statusCode: 404 });
  const { rows } = await pool.query(
    `select c.id category_id, c.name category_name, c.sort_order category_sort_order,
      i.id item_id, i.name, i.description, i.price_pence, i.allergens, i.sort_order item_sort_order, i.is_available
     from menus m
     join menu_categories c on c.menu_id = m.id
     left join menu_items i on i.category_id = c.id and i.deleted_at is null and i.is_available = true
     where m.restaurant_id = $1 and m.is_active = true
     order by c.sort_order, i.sort_order`,
    [params.id]
  );
  const categories = new Map<string, { id: string; name: string; sortOrder: number; items: Array<Record<string, unknown>> }>();
  for (const row of rows) {
    const category = categories.get(row.category_id) ?? { id: row.category_id as string, name: row.category_name as string, sortOrder: row.category_sort_order as number, items: [] as Array<Record<string, unknown>> };
    if (row.item_id) category.items.push({
      id: row.item_id,
      name: row.name,
      description: row.description,
      pricePence: row.price_pence,
      allergens: row.allergens ?? [],
      isAvailable: row.is_available,
      sortOrder: row.item_sort_order
    });
    categories.set(row.category_id, category);
  }
  return { restaurant: { id: restaurant.rows[0].id, name: restaurant.rows[0].name, status: restaurant.rows[0].status }, categories: [...categories.values()] };
});

app.get("/api/v1/orders/:id", async (request) => {
  const user = requireAuth(request);
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const order = await pool.query(
    `select o.*, r.name restaurant_name from orders o join restaurants r on r.id = o.restaurant_id where o.id = $1 and o.deleted_at is null`,
    [params.id]
  );
  if (!order.rowCount) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  const row = order.rows[0];
  if (user.role === "customer" && row.customer_id !== user.sub) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  if (user.role === "restaurant_owner" || user.role === "restaurant_staff") await assertRestaurantAccess(user.sub, user.role, row.restaurant_id);
  const items = await pool.query("select item_name_snapshot name, quantity, unit_price_pence_snapshot, line_total_pence from order_items where order_id = $1 order by id", [params.id]);
  return { order: row, items: items.rows };
});

app.post("/api/v1/orders", async (request) => {
  const user = requireAuth(request, ["customer", "admin"]);
  const body = z.object({
    customerId: z.string().uuid().optional(),
    restaurantId: z.string().uuid(),
    fulfilmentType: z.enum(["delivery", "collection"]),
    deliveryAddressId: z.string().uuid().optional(),
    deliveryAddress: z.object({ line1: z.string().min(1), line2: z.string().optional(), town: z.string().min(1), postcode: z.string().min(3) }).optional(),
    customerContact: z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().optional() }),
    notes: z.string().max(500).optional(),
    idempotencyKey: z.string().min(8),
    items: z.array(z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().positive().max(99) })).min(1)
  }).parse(request.body);
  const customerId = user.role === "customer" ? user.sub : body.customerId;
  if (!customerId) throw Object.assign(new Error("customerId is required"), { statusCode: 400 });
  return createPendingOrder({ ...body, customerId });
});

app.post("/api/v1/orders/:id/payment-intents", async (request) => {
  const user = requireAuth(request, ["customer", "admin"]);
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({ idempotencyKey: z.string().min(8) }).parse(request.body);
  const access = await pool.query("select customer_id from orders where id = $1", [params.id]);
  if (!access.rowCount) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  if (user.role === "customer" && access.rows[0].customer_id !== user.sub) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  return createPaymentIntent(params.id, body.idempotencyKey);
});

app.get("/api/v1/restaurants/:id/orders", async (request) => {
  const user = requireAuth(request, ["restaurant_owner", "restaurant_staff", "admin"]);
  const params = restaurantParams.parse(request.params);
  await assertRestaurantAccess(user.sub, user.role, params.id);
  const { rows } = await pool.query(
    `select o.*, coalesce(json_agg(json_build_object('id', oi.id, 'name', oi.item_name_snapshot, 'quantity', oi.quantity,
      'unitPricePence', oi.unit_price_pence_snapshot, 'lineTotalPence', oi.line_total_pence)) filter (where oi.id is not null), '[]') items
     from orders o left join order_items oi on oi.order_id = o.id
     where o.restaurant_id = $1 and o.deleted_at is null and o.created_at > now() - interval '7 days'
     group by o.id order by o.created_at desc limit 100`,
    [params.id]
  );
  return { orders: rows };
});

app.patch("/api/v1/orders/:id/status", async (request) => {
  const user = requireAuth(request, ["restaurant_owner", "restaurant_staff", "admin", "support"]);
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const body = z.object({ status: z.enum(ORDER_STATUSES) }).parse(request.body);
  const order = await pool.query("select restaurant_id from orders where id = $1", [params.id]);
  if (!order.rowCount) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  if (user.role === "restaurant_owner" || user.role === "restaurant_staff") await assertRestaurantAccess(user.sub, user.role, order.rows[0].restaurant_id);
  const actor = user.role === "admin" ? "admin" : user.role === "support" ? "support" : "restaurant";
  return transitionOrder(params.id, body.status, actor, user.sub);
});

app.post("/api/v1/stripe/webhook", { config: { rawBody: true } }, async (request) => {
  const raw = (request as typeof request & { rawBody?: Buffer }).rawBody;
  if (!raw) throw Object.assign(new Error("Missing raw webhook body"), { statusCode: 400 });
  return handleStripeWebhook(raw, request.headers["stripe-signature"] as string | undefined);
});

app.get("/api/v1/admin/users", async (request) => {
  requireAuth(request, ["admin"]);
  const { rows } = await pool.query("select id, email, full_name, role from users where deleted_at is null order by email");
  return { users: rows };
});

app.post("/api/v1/admin/restaurants", async (request) => {
  requireAuth(request, ["admin"]);
  const body = adminRestaurantBody.parse(request.body);
  const { rows } = await pool.query(
    `insert into restaurants (owner_user_id, name, slug, status, cuisine_types, description, phone, email, address_line1, address_line2,
      town, county, postcode, minimum_order_pence, collection_enabled, delivery_enabled, is_accepting_orders, logo_url, estimated_prep_minutes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,
    [body.ownerUserId, body.name, body.slug, body.status, body.cuisineTypes, body.description ?? null, body.phone ?? null, body.email ?? null,
      body.addressLine1, body.addressLine2 ?? null, body.town, body.county ?? null, body.postcode, body.minimumOrderPence, body.collectionEnabled,
      body.deliveryEnabled, body.isAcceptingOrders, body.logoUrl ?? null, body.estimatedPrepMinutes]
  );
  await pool.query("insert into restaurant_staff_members (restaurant_id, user_id, role) values ($1,$2,'restaurant_owner') on conflict do nothing", [rows[0].id, body.ownerUserId]);
  return { restaurant: toRestaurant(rows[0]) };
});

app.patch("/api/v1/admin/restaurants/:id", async (request) => {
  requireAuth(request, ["admin"]);
  const params = restaurantParams.parse(request.params);
  const body = adminRestaurantBody.partial().parse(request.body);
  const current = await pool.query("select * from restaurants where id = $1 and deleted_at is null", [params.id]);
  if (!current.rowCount) throw Object.assign(new Error("Restaurant not found"), { statusCode: 404 });
  const merged = current.rows[0];
  const { rows } = await pool.query(
    `update restaurants set owner_user_id=$1, name=$2, slug=$3, status=$4, cuisine_types=$5, description=$6, phone=$7, email=$8,
      address_line1=$9, address_line2=$10, town=$11, county=$12, postcode=$13, minimum_order_pence=$14, collection_enabled=$15,
      delivery_enabled=$16, is_accepting_orders=$17, logo_url=$18, estimated_prep_minutes=$19, updated_at=now() where id=$20 returning *`,
    [body.ownerUserId ?? merged.owner_user_id, body.name ?? merged.name, body.slug ?? merged.slug, body.status ?? merged.status,
      body.cuisineTypes ?? merged.cuisine_types, body.description ?? merged.description, body.phone ?? merged.phone, body.email ?? merged.email,
      body.addressLine1 ?? merged.address_line1, body.addressLine2 ?? merged.address_line2, body.town ?? merged.town, body.county ?? merged.county,
      body.postcode ?? merged.postcode, body.minimumOrderPence ?? merged.minimum_order_pence, body.collectionEnabled ?? merged.collection_enabled,
      body.deliveryEnabled ?? merged.delivery_enabled, body.isAcceptingOrders ?? merged.is_accepting_orders, body.logoUrl ?? merged.logo_url,
      body.estimatedPrepMinutes ?? merged.estimated_prep_minutes, params.id]
  );
  return { restaurant: toRestaurant(rows[0]) };
});

app.post("/api/v1/admin/restaurants/:id/menu-categories", async (request) => {
  requireAuth(request, ["admin"]);
  const params = restaurantParams.parse(request.params);
  const body = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) }).parse(request.body);
  const menu = await pool.query("select id from menus where restaurant_id = $1 and is_active = true limit 1", [params.id]);
  if (!menu.rowCount) throw Object.assign(new Error("Active menu not found"), { statusCode: 404 });
  const { rows } = await pool.query("insert into menu_categories (menu_id, name, sort_order) values ($1,$2,$3) returning *", [menu.rows[0].id, body.name, body.sortOrder]);
  return { category: rows[0] };
});

app.post("/api/v1/admin/menu-categories/:categoryId/items", async (request) => {
  requireAuth(request, ["admin"]);
  const params = z.object({ categoryId: z.string().uuid() }).parse(request.params);
  const body = z.object({ name: z.string().min(1), description: z.string().optional(), pricePence: z.number().int().nonnegative(), allergens: z.array(z.string()).default([]), isAvailable: z.boolean().default(true), sortOrder: z.number().int().default(0) }).parse(request.body);
  const { rows } = await pool.query(
    "insert into menu_items (category_id, name, description, price_pence, allergens, is_available, sort_order) values ($1,$2,$3,$4,$5,$6,$7) returning *",
    [params.categoryId, body.name, body.description ?? null, body.pricePence, body.allergens, body.isAvailable, body.sortOrder]
  );
  return { item: rows[0] };
});

app.patch("/api/v1/admin/menu-items/:itemId", async (request) => {
  requireAuth(request, ["admin"]);
  const params = z.object({ itemId: z.string().uuid() }).parse(request.params);
  const body = z.object({ name: z.string().min(1).optional(), description: z.string().optional(), pricePence: z.number().int().nonnegative().optional(), allergens: z.array(z.string()).optional(), isAvailable: z.boolean().optional(), sortOrder: z.number().int().optional() }).parse(request.body);
  const { rows, rowCount } = await pool.query(
    `update menu_items set name=coalesce($1,name), description=coalesce($2,description), price_pence=coalesce($3,price_pence),
      allergens=coalesce($4,allergens), is_available=coalesce($5,is_available), sort_order=coalesce($6,sort_order), updated_at=now()
     where id=$7 and deleted_at is null returning *`,
    [body.name ?? null, body.description ?? null, body.pricePence ?? null, body.allergens ?? null, body.isAvailable ?? null, body.sortOrder ?? null, params.itemId]
  );
  if (!rowCount) throw Object.assign(new Error("Menu item not found"), { statusCode: 404 });
  return { item: rows[0] };
});

app.post("/api/v1/admin/restaurants/:id/owner", async (request) => {
  requireAuth(request, ["admin"]);
  const params = restaurantParams.parse(request.params);
  const body = z.object({ userId: z.string().uuid() }).parse(request.body);
  await pool.query("update restaurants set owner_user_id = $1, updated_at = now() where id = $2", [body.userId, params.id]);
  await pool.query("insert into restaurant_staff_members (restaurant_id, user_id, role) values ($1,$2,'restaurant_owner') on conflict (restaurant_id, user_id) do update set role='restaurant_owner'", [params.id, body.userId]);
  return { ok: true };
});

app.get("/api/v1/admin/rnli-report", async (request, reply) => {
  requireAuth(request, ["admin"]);
  const query = z.object({ from: z.string().optional(), to: z.string().optional(), restaurantId: z.string().uuid().optional(), format: z.enum(["json", "csv"]).default("json") }).parse(request.query);
  const { rows } = await pool.query(
    `select r.id restaurant_id, r.name restaurant_name, count(o.id)::int order_count,
      coalesce(sum(o.total_pence),0)::int gross_order_value_pence,
      coalesce(sum(o.commission_pence),0)::int marsh_eats_commission_pence,
      coalesce(sum(o.restaurant_payable_pence),0)::int restaurant_payable_pence,
      coalesce(sum(o.rnli_contribution_pence),0)::int rnli_contribution_pence
     from restaurants r left join orders o on o.restaurant_id = r.id and o.status in ('paid','sent_to_restaurant','accepted','preparing','ready','completed')
      and ($1::timestamptz is null or o.created_at >= $1::timestamptz)
      and ($2::timestamptz is null or o.created_at <= $2::timestamptz)
     where ($3::uuid is null or r.id = $3::uuid) and r.deleted_at is null
     group by r.id, r.name order by r.name`,
    [query.from ?? null, query.to ?? null, query.restaurantId ?? null]
  );
  type ReportRow = { order_count: number; gross_order_value_pence: number; marsh_eats_commission_pence: number; restaurant_payable_pence: number; rnli_contribution_pence: number; restaurant_name: string };
  const reportRows = rows as ReportRow[];
  const totals = reportRows.reduce((acc, row) => ({
    orderCount: acc.orderCount + row.order_count,
    grossOrderValuePence: acc.grossOrderValuePence + row.gross_order_value_pence,
    marshEatsCommissionPence: acc.marshEatsCommissionPence + row.marsh_eats_commission_pence,
    restaurantPayablePence: acc.restaurantPayablePence + row.restaurant_payable_pence,
    rnliContributionPence: acc.rnliContributionPence + row.rnli_contribution_pence
  }), { orderCount: 0, grossOrderValuePence: 0, marshEatsCommissionPence: 0, restaurantPayablePence: 0, rnliContributionPence: 0 });
  if (query.format === "csv") {
    reply.header("Content-Type", "text/csv");
    return ["restaurant,orders,gross_pence,commission_pence,payable_pence,rnli_pence", ...reportRows.map((row) => `${row.restaurant_name},${row.order_count},${row.gross_order_value_pence},${row.marsh_eats_commission_pence},${row.restaurant_payable_pence},${row.rnli_contribution_pence}`)].join("\n");
  }
  return { filters: query, totals, restaurants: reportRows };
});

app.get("/api/v1/account/restaurants", async (request) => {
  const user = requireAuth(request, ["restaurant_owner", "restaurant_staff", "admin"]);
  const { rows } = user.role === "admin"
    ? await pool.query("select id, name from restaurants where deleted_at is null order by name")
    : await pool.query("select r.id, r.name from restaurants r join restaurant_staff_members s on s.restaurant_id = r.id where s.user_id = $1 order by r.name", [user.sub]);
  return { restaurants: rows };
});

registerRealtimeRoutes(app);

await app.listen({ port: config.PORT, host: "0.0.0.0" });
