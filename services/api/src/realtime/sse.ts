import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

export function registerRealtimeRoutes(app: FastifyInstance) {
  app.get("/restaurants/:restaurantId/orders/events", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    const client = await pool.connect();
    await client.query("listen order_status_changed");
    const onNotification = (message: { payload?: string }) => {
      reply.raw.write(`event: order-status\ndata: ${message.payload}\n\n`);
    };
    client.on("notification", onNotification);
    request.raw.on("close", () => {
      client.off("notification", onNotification);
      client.release();
    });
  });
}
