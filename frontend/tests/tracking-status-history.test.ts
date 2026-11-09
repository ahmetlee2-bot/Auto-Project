import test from "node:test";
import assert from "node:assert/strict";
import { appendDeliveryStatus, nextDeliveryStatus, type DeliveryStatus } from "../lib/tracking/status-history";

test("supplier status history advances without regressing or inventing events", () => {
  const history = appendDeliveryStatus([], "ORDER_RECEIVED", "ORDER_RECEIVED", "2026-11-09T10:00:00Z");
  assert.equal(history.length, 1);
  assert.equal(history[0].status, "ORDER_RECEIVED");
  assert.equal(nextDeliveryStatus("IN_TRANSIT", "SHIPPED"), "IN_TRANSIT");
  assert.equal(nextDeliveryStatus("IN_TRANSIT", "DELIVERED"), "DELIVERED");
  assert.equal(nextDeliveryStatus("DELIVERED", "IN_TRANSIT"), "DELIVERED");
  const advanced = appendDeliveryStatus(history, "ORDER_RECEIVED", "IN_TRANSIT", "2026-11-09T11:00:00Z");
  assert.deepEqual(advanced.map(item => item.status), ["ORDER_RECEIVED", "IN_TRANSIT"]);
  assert.equal(nextDeliveryStatus("IN_TRANSIT", "EXCEPTION"), "EXCEPTION");
});
