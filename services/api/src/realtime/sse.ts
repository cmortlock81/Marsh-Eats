import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyToken } from "../auth-service.js";
import { pool } from "../db/pool.js";

async function assertRestaurantAccess(userId: string, role: string, restaurantId: string) {
  if (role === "admin") return;
  const access = await pool.query(
    "select 1 from restaurant_staff_members where restaurant_id = $1 and user_id = $2",
    [restaurantId, userId]
  );
  if (!access.rowCount) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
}

export function registerRealtimeRoutes(app: FastifyInstance) {
  app.get("/restaurants/:restaurantId/orders/events", async (request, reply) => {
    const params = z.object({ restaurantId: z.string().uuid() }).parse(request.params);
    const query = z.object({ token: z.string().min(20).optional() }).parse(request.query);
    const headerToken = (request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const user = verifyToken(query.token ?? headerToken);
    if (!["restaurant_owner", "restaurant_staff", "admin"].includes(user.role)) {
      throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
    }
    await assertRestaurantAccess(user.sub, user.role, params.restaurantId);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    reply.raw.write("event: connected\ndata: {\"ok\":true}\n\n");
    const client = await pool.connect();
    await client.query("listen order_status_changed");
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 25_000);
    const onNotification = (message: { payload?: string }) => {
      if (!message.payload) return;
      try {
        const payload = JSON.parse(message.payload) as { restaurantId?: string };
        if (payload.restaurantId && payload.restaurantId !== params.restaurantId) return;
      } catch {
        return;
      }
      reply.raw.write(`event: order-status\ndata: ${message.payload}\n\n`);
    };
    client.on("notification", onNotification);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      client.off("notification", onNotification);
      client.release();
    });
  });
}
