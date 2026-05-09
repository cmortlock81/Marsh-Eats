import type pg from "pg";
import { assertTransition, calculateMoneyBreakdown, type Actor, type OrderStatus } from "@marsh-eats/shared";
import { withTransaction } from "../db/pool.js";

export interface BasketItemInput {
  menuItemId: string;
  quantity: number;
  name: string;
  unitPricePence: number;
  allergens: string[];
  modifiers: unknown[];
}

export interface CreateOrderInput {
  customerId: string;
  restaurantId: string;
  fulfilmentType: "delivery" | "collection";
  deliveryAddressId?: string;
  items: BasketItemInput[];
  idempotencyKey: string;
}

export async function createPendingOrder(input: CreateOrderInput) {
  return withTransaction(async (client) => {
    const existing = await client.query("select response_body from idempotency_keys where key = $1", [input.idempotencyKey]);
    if (existing.rowCount) return existing.rows[0].response_body;

    const subtotalPence = input.items.reduce((sum, item) => sum + item.unitPricePence * item.quantity, 0);
    const breakdown = calculateMoneyBreakdown(subtotalPence);
    const order = await client.query(
      `insert into orders (customer_id, restaurant_id, fulfilment_type, delivery_address_id, subtotal_pence, total_pence,
        commission_pence, rnli_contribution_pence, restaurant_payable_pence, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment') returning *`,
      [
        input.customerId,
        input.restaurantId,
        input.fulfilmentType,
        input.deliveryAddressId ?? null,
        subtotalPence,
        breakdown.totalPence,
        breakdown.commissionPence,
        breakdown.rnliContributionPence,
        breakdown.restaurantPayablePence
      ]
    );

    for (const item of input.items) {
      await client.query(
        `insert into order_items (order_id, menu_item_id, item_name_snapshot, unit_price_pence_snapshot, quantity,
          allergens_snapshot, modifiers_snapshot, line_total_pence)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.rows[0].id,
          item.menuItemId,
          item.name,
          item.unitPricePence,
          item.quantity,
          JSON.stringify(item.allergens),
          JSON.stringify(item.modifiers),
          item.unitPricePence * item.quantity
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
    await client.query("select pg_notify('order_status_changed', $1)", [JSON.stringify({ orderId, status: toStatus })]);
    return updated.rows[0];
  });
}

async function recordStatusEvent(
  client: pg.PoolClient,
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
