import admin from "firebase-admin";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://marsh:marsh@postgres:5432/marsh_eats";
const customerAppUrl = process.env.CUSTOMER_APP_URL ?? "https://eat.marsh-eats.local";
const pool = new pg.Pool({ connectionString: databaseUrl });

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function sendOrderNotification(orderId: string, status: string) {
  if (!["accepted", "ready", "completed"].includes(status)) return;
  const { rows } = await pool.query(
    `select nt.token from notification_tokens nt
     join orders o on o.customer_id = nt.user_id
     where o.id = $1 and nt.revoked_at is null`,
    [orderId]
  );
  if (!rows.length) return;
  await admin.messaging().sendEachForMulticast({
    tokens: rows.map((row) => row.token),
    data: { orderId, status, url: `${customerAppUrl}/orders/${orderId}` },
    notification: { title: "Marsh Eats order update", body: `Your order is ${status.replaceAll("_", " ")}.` }
  });
}

const client = await pool.connect();
await client.query("listen order_status_changed");
client.on("notification", async ({ payload }) => {
  if (!payload) return;
  const event = JSON.parse(payload) as { orderId: string; status: string };
  await sendOrderNotification(event.orderId, event.status);
});
console.log("Marsh Eats worker listening for order status events");
