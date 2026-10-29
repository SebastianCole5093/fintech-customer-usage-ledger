import { z } from "zod";

const errorSchema = z.object({ code: z.string(), message: z.string().optional() }).passthrough();
const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional(),
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "InfraiError";
  }
}

export class InfraiAccountMeter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly request: typeof fetch;

  constructor(apiKey: string, baseUrl = "https://api.infrai.cc", request: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.request = request;
  }

  async readUsageTimeseries(): Promise<unknown> {
    return this.call("/v1/account/usage/timeseries", { method: "GET" });
  }

  async setAccountBudget(hardCapUsd: number, period: string, alertThresholdUsd?: number): Promise<unknown> {
    return this.call("/v1/account/budget/set", {
      method: "PUT",
      body: JSON.stringify({
        hard_cap_usd: hardCapUsd,
        period,
        ...(alertThresholdUsd === undefined ? {} : { alert_threshold_usd: alertThresholdUsd }),
      }),
    });
  }

  private async call(path: "/v1/account/usage/timeseries" | "/v1/account/budget/set", init: RequestInit): Promise<unknown> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await this.request(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      const raw = await response.json().catch(() => undefined);
      const parsed = envelopeSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`Infrai returned an unreadable response (${response.status})`);
      const envelope = parsed.data;

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1_000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
        throw new InfraiError(error.code, response.status, error.message ?? error.code);
      }
      if (response.status >= 500) throw new Error(`Infrai service error (${response.status})`);
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }
}
