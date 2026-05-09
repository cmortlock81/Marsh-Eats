export const USER_ROLES = ["customer", "restaurant_owner", "restaurant_staff", "admin", "support"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "sent_to_restaurant",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
  "refunded",
  "failed"
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const RESTAURANT_STATUSES = ["draft", "pending_review", "active", "suspended", "closed"] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "requires_payment_method",
  "requires_confirmation",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded"
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type Actor = "stripe_webhook" | "api_timeout" | "worker" | "restaurant" | "admin" | "support";

const transitions: Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>> = {
  pending_payment: { paid: ["stripe_webhook"], failed: ["stripe_webhook", "api_timeout"] },
  paid: { sent_to_restaurant: ["worker"], cancelled: ["admin", "restaurant"], refunded: ["admin"] },
  sent_to_restaurant: { accepted: ["restaurant"], cancelled: ["admin", "restaurant"] },
  accepted: { preparing: ["restaurant"], cancelled: ["admin", "restaurant"] },
  preparing: { ready: ["restaurant"] },
  ready: { completed: ["restaurant", "admin"] },
  completed: { refunded: ["admin"] },
  cancelled: { refunded: ["admin"] },
  refunded: {},
  failed: {}
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return transitions[from]?.[to]?.includes(actor) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidOrderTransitionError(from, to, actor);
  }
}

export class InvalidOrderTransitionError extends Error {
  readonly statusCode = 409;

  constructor(readonly from: OrderStatus, readonly to: OrderStatus, readonly actor: Actor) {
    super(`Invalid order status transition: ${from} -> ${to} by ${actor}`);
  }
}

export interface MoneyBreakdown {
  totalPence: number;
  commissionPence: number;
  rnliContributionPence: number;
  restaurantPayablePence: number;
  currency: "GBP";
}

export function calculateMoneyBreakdown(totalPence: number): MoneyBreakdown {
  if (!Number.isInteger(totalPence) || totalPence < 0) {
    throw new RangeError("totalPence must be a non-negative integer number of pence");
  }

  const commissionPence = Math.round((totalPence * 800) / 10_000);
  const rnliContributionPence = Math.round((totalPence * 100) / 10_000);
  return {
    totalPence,
    commissionPence,
    rnliContributionPence,
    restaurantPayablePence: totalPence - commissionPence - rnliContributionPence,
    currency: "GBP"
  };
}

export function formatPounds(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}
