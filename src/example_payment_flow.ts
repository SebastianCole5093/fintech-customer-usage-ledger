import { CustomerUsageLedger, paymentEventSchema, signNotification, verifyNotification } from "./customer_usage_ledger.js";
import { InfraiAccountMeter } from "./infrai_account_meter.js";

const apiKey = process.env.INFRAI_API_KEY;
const auditSecret = process.env.AUDIT_WEBHOOK_SECRET;
if (!apiKey || !auditSecret) throw new Error("Set INFRAI_API_KEY and AUDIT_WEBHOOK_SECRET");

const infrai = new InfraiAccountMeter(apiKey);
await infrai.setAccountBudget(500, "monthly", 400);

const ledger = new CustomerUsageLedger();
const event = paymentEventSchema.parse({
  event_id: "evt_demo_001",
  customer_id: "merchant_42",
  operation: "payment_authorization",
  units: 125,
  risk_score: 24,
  occurred_at: "2026-09-14T10:00:00.000Z",
});
const decision = ledger.record(event);
const notice = signNotification(decision, auditSecret);
const notificationVerified = verifyNotification(notice.payload, notice.signature, auditSecret);
const accountUsageTimeseries = await infrai.readUsageTimeseries();

console.log(JSON.stringify({ decision, notificationVerified, accountUsageTimeseries }, null, 2));
