import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url().default("postgres://marsh:marsh@postgres:5432/marsh_eats"),
  REDIS_URL: z.string().url().default("redis://redis:6379"),
  STRIPE_SECRET_KEY: z.string().min(1).default("sk_test_replace_me"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default("whsec_replace_me"),
  CUSTOMER_APP_URL: z.string().url().default("https://eat.marsh-eats.local")
});

export const config = schema.parse(process.env);
