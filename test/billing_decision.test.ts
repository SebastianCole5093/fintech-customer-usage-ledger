import assert from "node:assert/strict";
import test from "node:test";
import { CustomerUsageLedger, paymentEventSchema, signNotification, verifyNotification } from "../src/customer_usage_ledger.js";

test("a high-risk payment is blocked and its audit notification verifies", () => {
  const ledger = new CustomerUsageLedger();
  const decision = ledger.record(paymentEventSchema.parse({
    event_id: "evt_risk_9001",
    customer_id: "merchant_red",
    operation: "payment_capture",
    units: 40,
    risk_score: 91,
    occurred_at: "2026-09-14T09:00:00.000Z",
  }));

  assert.equal(decision.action, "block");
  assert.equal(decision.customer_units, 40);
  const notice = signNotification(decision, "test-audit-secret-1234");
  assert.equal(verifyNotification(notice.payload, notice.signature, "test-audit-secret-1234"), true);
  assert.equal(verifyNotification(notice.payload, notice.signature, "different-secret-5678"), false);
});
