import express from "express";
import { ZodError, z } from "zod";
import { CustomerUsageLedger, paymentEventSchema, signNotification, verifyNotification } from "./customer_usage_ledger.js";
import { InfraiAccountMeter, InfraiError } from "./infrai_account_meter.js";

const envSchema = z.object({
  INFRAI_API_KEY: z.string().min(1),
  AUDIT_WEBHOOK_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3000),
});

const env = envSchema.parse(process.env);
const ledger = new CustomerUsageLedger();
const infrai = new InfraiAccountMeter(env.INFRAI_API_KEY);
const app = express();
app.use(express.json());

app.post("/payment-events", async (request, response) => {
  try {
    const event = paymentEventSchema.parse(request.body);
    const decision = ledger.record(event);
    const notice = signNotification(decision, env.AUDIT_WEBHOOK_SECRET);
    if (!verifyNotification(notice.payload, notice.signature, env.AUDIT_WEBHOOK_SECRET)) {
      throw new Error("Audit signature verification failed");
    }

    const account_usage_timeseries = await infrai.readUsageTimeseries();
    response.status(decision.action === "block" ? 403 : 202).json({
      decision,
      audit_notification: { verified: true, signature: notice.signature },
      account_usage_timeseries,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid_payment_event", details: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, message: error.message });
      return;
    }
    response.status(502).json({ error: "metering_unavailable" });
  }
});

app.listen(env.PORT, () => {
  console.log(`Payment meter listening on http://localhost:${env.PORT}`);
});
