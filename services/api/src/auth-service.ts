import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { pool } from "./db/pool.js";
import type { UserRole } from "@marsh-eats/shared";

const secret = process.env.AUTH_TOKEN_SECRET ?? "replace-with-32-byte-production-secret";
const ttlSeconds = 60 * 60;

export const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(12) });

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [, salt, expected] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

export function signToken(payload: Record<string, string>) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw Object.assign(new Error("Invalid token"), { statusCode: 401 });
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) {
    throw Object.assign(new Error("Invalid token"), { statusCode: 401 });
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw Object.assign(new Error("Token expired"), { statusCode: 401 });
  return payload as { sub: string; role: UserRole; email: string; exp: number };
}

export function requireAuth(request: FastifyRequest, allowedRoles?: UserRole[]) {
  const header = request.headers.authorization ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
  return payload;
}

export async function registerCustomer(input: { email: string; password: string; fullName: string; phone?: string }) {
  const passwordHash = hashPassword(input.password);
  const { rows } = await pool.query(
    `insert into users (email, phone, password_hash, full_name, role) values ($1,$2,$3,$4,'customer')
     returning id, email, full_name, role`,
    [input.email.toLowerCase(), input.phone ?? null, passwordHash, input.fullName]
  );
  return { user: rows[0], accessToken: signToken({ sub: rows[0].id, role: rows[0].role, email: rows[0].email }) };
}

export async function login(input: { email: string; password: string }) {
  const { rows, rowCount } = await pool.query("select id, email, full_name, role, password_hash from users where email = $1 and deleted_at is null", [input.email.toLowerCase()]);
  if (!rowCount || !verifyPassword(input.password, rows[0].password_hash)) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  return { user: { id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name, role: rows[0].role }, accessToken: signToken({ sub: rows[0].id, role: rows[0].role, email: rows[0].email }) };
}
