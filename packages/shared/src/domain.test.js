import assert from "node:assert/strict";
import test from "node:test";

const { calculateMoneyBreakdown, canTransition } = await import("../dist/domain.js");

test("calculates 8% commission, 1% RNLI, and restaurant payable in pence", () => {
  assert.deepEqual(calculateMoneyBreakdown(3200), {
    totalPence: 3200,
    commissionPence: 256,
    rnliContributionPence: 32,
    restaurantPayablePence: 2912,
    currency: "GBP"
  });
});

test("enforces the order state machine", () => {
  assert.equal(canTransition("pending_payment", "paid", "stripe_webhook"), true);
  assert.equal(canTransition("pending_payment", "accepted", "restaurant"), false);
  assert.equal(canTransition("ready", "completed", "restaurant"), true);
});
