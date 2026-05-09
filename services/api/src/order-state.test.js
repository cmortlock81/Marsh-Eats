import assert from "node:assert/strict";
import test from "node:test";

const { canTransition } = await import("../../../packages/shared/dist/domain.js");

test("restaurants cannot skip directly to completed", () => {
  assert.equal(canTransition("sent_to_restaurant", "completed", "restaurant"), false);
});
