import { pool } from "../db/pool.js";
import { config } from "../config.js";

const notifyStatuses = new Set(["accepted", "ready", "completed"]);

export async function queueStatusNotification(orderId: string, status: string) {
  if (!notifyStatuses.has(status)) return;
  await pool.query(
    `insert into audit_log (actor_type, action, entity_type, entity_id, metadata)
     values ('system','notification.queued','order',$1,$2)`,
    [orderId, { status, url: `${config.CUSTOMER_APP_URL}/orders/${orderId}` }]
  );
}

export function buildFcmPayload(orderId: string, status: string) {
  return {
    data: { orderId, status, url: `${config.CUSTOMER_APP_URL}/orders/${orderId}` },
    notification: { title: "Marsh Eats order update", body: `Your order is ${status.replaceAll("_", " ")}.` }
  };
}
