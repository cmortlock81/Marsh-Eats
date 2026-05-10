import type { PoolClient } from "pg";
import { assertTransition, calculateMoneyBreakdown, type Actor, type OrderStatus } from "@marsh-eats/shared";
import { withTransaction } from "../db/pool.js";

export interface BasketItemInput {
  menuItemId: string;
  quantity: number;
  name?: string;
  unitPricePence?: number;
  allergens?: string[];
  modifiers?: unknown[];
}

interface MenuItemSnapshot {
  id: string;
  name: string;
  pricePence: number;
  allergens: string[];
  modifiers: unknown[];
}

interface OrderLineItem {
  menuItemId: string;
  quantity: number;
  snapshot: MenuItemSnapshot;
}

export interface CreateOrderInput {
  customerId: string;
  restaurantId: string;
  fulfilmentType: "delivery" | "collection";
  deliveryAddressId?: string;
  customerContact: { name: string; email: string; phone?: string };
  deliveryAddress?: { line1: string; line2?: string; town: string; postcode: string };
  notes?: string;
  items: BasketItemInput[];
  idempotencyKey: string;
}

export async function createPendingOrder(input: CreateOrderInput) {
  return withTransaction(async (client) => {
    const existing = await client.query("select response_body from idempotency_keys where key = $1", [input.idempotencyKey]);
    if (existing.rowCount) return existing.rows[0].response_body;

    const restaurant = await client.query(
      `select id, status, minimum_order_pence, collection_enabled, delivery_enabled, is_accepting_orders
       from restaurants where id = $1 and deleted_at is null for share`,
      [input.restaurantId]
    );
    if (!restaurant.rowCount) throw Object.assign(new Error("Restaurant not found"), { statusCode: 404 });
    if (restaurant.rows[0].status !== "active" || !restaurant.rows[0].is_accepting_orders) {
      throw Object.assign(new Error("Restaurant is not accepting orders"), { statusCode: 400 });
    }
    if (input.fulfilmentType === "delivery" && !restaurant.rows[0].delivery_enabled) {
      throw Object.assign(new Error("Restaurant does not offer delivery"), { statusCode: 400 });
    }
    if (input.fulfilmentType === "collection" && !restaurant.rows[0].collection_enabled) {
      throw Object.assign(new Error("Restaurant does not offer collection"), { statusCode: 400 });
    }

    const orderLineItems = await buildOrderLineItems(client, input.restaurantId, input.items);
    const subtotalPence = orderLineItems.reduce((sum, item) => sum + item.snapshot.pricePence * item.quantity, 0);
    if (subtotalPence < restaurant.rows[0].minimum_order_pence) {
      throw Object.assign(new Error("Order is below the restaurant minimum"), { statusCode: 400 });
    }
    const breakdown = calculateMoneyBreakdown(subtotalPence);
    const order = await client.query(
      `insert into orders (customer_id, restaurant_id, fulfilment_type, delivery_address_id, subtotal_pence, total_pence,
        commission_pence, rnli_contribution_pence, restaurant_payable_pence, status, customer_name, customer_email,
        customer_phone, delivery_address_snapshot, customer_note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment',$10,$11,$12,$13,$14) returning *`,
      [
        input.customerId,
        input.restaurantId,
        input.fulfilmentType,
        input.deliveryAddressId ?? null,
        subtotalPence,
        breakdown.totalPence,
        breakdown.commissionPence,
        breakdown.rnliContributionPence,
        breakdown.restaurantPayablePence,
        input.customerContact.name,
        input.customerContact.email.toLowerCase(),
        input.customerContact.phone ?? null,
        input.deliveryAddress ? JSON.stringify(input.deliveryAddress) : null,
        input.notes ?? null
      ]
    );

    for (const item of orderLineItems) {
      await client.query(
        `insert into order_items (order_id, menu_item_id, item_name_snapshot, unit_price_pence_snapshot, quantity,
          allergens_snapshot, modifiers_snapshot, line_total_pence)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.rows[0].id,
          item.menuItemId,
          item.snapshot.name,
          item.snapshot.pricePence,
          item.quantity,
          JSON.stringify(item.snapshot.allergens),
          JSON.stringify(item.snapshot.modifiers),
          item.snapshot.pricePence * item.quantity
        ]
      );
    }

    await client.query("insert into rnli_contributions (order_id, amount_pence, currency) values ($1,$2,'GBP')", [
      order.rows[0].id,
      breakdown.rnliContributionPence
    ]);
    await recordStatusEvent(client, order.rows[0].id, null, "pending_payment", "customer", input.customerId);
    await client.query("insert into idempotency_keys (key, scope, response_body) values ($1,'orders.create',$2)", [
      input.idempotencyKey,
      order.rows[0]
    ]);
    return order.rows[0];
  });
}

export async function transitionOrder(orderId: string, toStatus: OrderStatus, actor: Actor, actorUserId?: string) {
  return withTransaction(async (client) => {
    const current = await client.query("select * from orders where id = $1 for update", [orderId]);
    if (!current.rowCount) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

    const fromStatus = current.rows[0].status as OrderStatus;
    assertTransition(fromStatus, toStatus, actor);
    const updated = await client.query("update orders set status = $1, updated_at = now() where id = $2 returning *", [toStatus, orderId]);
    await recordStatusEvent(client, orderId, fromStatus, toStatus, actor, actorUserId);
    await client.query("select pg_notify('order_status_changed', $1)", [JSON.stringify({ orderId, restaurantId: current.rows[0].restaurant_id, status: toStatus })]);
    return updated.rows[0];
  });
}

async function recordStatusEvent(
  client: PoolClient,
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  actor: string,
  actorUserId?: string
) {
  await client.query(
    `insert into order_status_events (order_id, from_status, to_status, actor_type, actor_user_id)
     values ($1,$2,$3,$4,$5)`,
    [orderId, fromStatus, toStatus, actor, actorUserId ?? null]
  );
}

async function buildOrderLineItems(
  client: PoolClient,
  restaurantId: string,
  items: BasketItemInput[]
): Promise<OrderLineItem[]> {
  const menuItemIds = [...new Set(items.map((item) => item.menuItemId))];
  const { rows } = await client.query(
    `select i.id, i.name, i.price_pence, i.allergens, i.modifiers
     from menu_items i
     join menu_categories c on c.id = i.category_id
     join menus m on m.id = c.menu_id
     where i.id = any($1::uuid[])
       and m.restaurant_id = $2
       and m.is_active = true
       and i.is_available = true
       and i.deleted_at is null`,
    [menuItemIds, restaurantId]
  );

  const snapshots = new Map<string, MenuItemSnapshot>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        pricePence: row.price_pence,
        allergens: row.allergens ?? [],
        modifiers: row.modifiers ?? []
      }
    ])
  );

  if (snapshots.size !== menuItemIds.length) {
    throw Object.assign(new Error("One or more menu items are unavailable"), { statusCode: 400 });
  }

  return items.map((item) => ({
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    snapshot: snapshots.get(item.menuItemId)!
  }));
}
