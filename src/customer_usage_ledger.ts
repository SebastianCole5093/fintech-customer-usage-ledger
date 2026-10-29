import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const paymentEventSchema = z.object({
  event_id: z.string().min(1),
  customer_id: z.string().min(1),
  operation: z.enum(["payment_authorization", "payment_capture", "refund"]),
  units: z.number().int().positive(),
  risk_score: z.number().min(0).max(100),
  occurred_at: z.string().datetime(),
});

export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type RiskAction = "approve" | "review" | "block";

export interface MeteringDecision {
  event_id: string;
  customer_id: string;
  customer_units: number;
  action: RiskAction;
  reason: string;
}

export class CustomerUsageLedger {
  private readonly events = new Map<string, PaymentEvent>();

  record(event: PaymentEvent): MeteringDecision {
    const existing = this.events.get(event.event_id);
    if (existing) return this.decide(existing);
    this.events.set(event.event_id, event);
    return this.decide(event);
  }

  private decide(event: PaymentEvent): MeteringDecision {
    const customerUnits = [...this.events.values()]
      .filter((item) => item.customer_id === event.customer_id)
      .reduce((sum, item) => sum + item.units, 0);

    if (event.risk_score >= 85) {
      return this.result(event, customerUnits, "block", "risk score reached the blocking threshold");
    }
    if (event.risk_score >= 60 || customerUnits > 10_000) {
      return this.result(event, customerUnits, "review", "risk or accumulated usage requires review");
    }
    return this.result(event, customerUnits, "approve", "risk and accumulated usage are within policy");
  }

  private result(event: PaymentEvent, customerUnits: number, action: RiskAction, reason: string): MeteringDecision {
    return {
      event_id: event.event_id,
      customer_id: event.customer_id,
      customer_units: customerUnits,
      action,
      reason,
    };
  }
}

export function signNotification(decision: MeteringDecision, secret: string): { payload: string; signature: string } {
  const payload = JSON.stringify(decision);
  return { payload, signature: createHmac("sha256", secret).update(payload).digest("hex") };
}

export function verifyNotification(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
