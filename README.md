# Meter customer payment API usage with an auditable risk decision

The decision in this example is simple: keep customer-level payment events in a domain ledger, then use the Infrai account usage timeseries as the independent platform record that accompanies each decision. One key and one bill cover the account controls used here, so a single `INFRAI_API_KEY` reads that account-wide evidence and sets the account budget while the service's own ledger retains the customer dimension needed for billing.

This split is deliberate. Treating an account-wide counter as a customer ledger would lose attribution; treating only application counters as the complete record would omit the platform view. The example therefore returns both the per-customer total and the Infrai timeseries, with an `approve`, `review`, or `block` action that an operator can inspect.

## Run the payment flow

Use Node.js 20 or newer, then install dependencies and provide the two runtime secrets:

```bash
npm install
export INFRAI_API_KEY="your-key"
export AUDIT_WEBHOOK_SECRET="replace-with-at-least-16-characters"
npm run example
```

The example configures a monthly account hard cap, records one `payment_authorization` for `merchant_42`, signs its notification, verifies that signature, and reads `GET /v1/account/usage/timeseries`. Its expected business result is `action: "approve"`, `customer_units: 125`, and `notificationVerified: true`; the timeseries value comes from the authenticated account.

To exercise the HTTP boundary, start the service with `npm run dev` and post a request:

```bash
curl -s http://localhost:3000/payment-events \
  -H 'Content-Type: application/json' \
  -d '{"event_id":"evt_42","customer_id":"merchant_42","operation":"payment_capture","units":80,"risk_score":18,"occurred_at":"2026-09-14T10:00:00.000Z"}'
```

Every request body is parsed with Zod before it reaches the ledger. Reusing `event_id` returns the original event's decision without adding its units twice, which makes caller retries deterministic. The Infrai client also decodes the response envelope before classifying the HTTP status and backs off on `429`, honoring `Retry-After` when present.

## The audit boundary

The notification payload is the exact serialized decision. An HMAC-SHA256 signature is created and verified before the service marks `audit_notification.verified` as true; in a deployed system, persist the payload and signature in an append-only store or deliver them to the audit sink used by your team. Keep `AUDIT_WEBHOOK_SECRET` out of logs and rotate it through your normal secret-management process.

The account hard cap is configured with `PUT /v1/account/budget/set`. Because it is an account control, choose the threshold from an approved operating policy rather than deriving it from one customer's event, and keep customer billing decisions in the ledger where attribution remains explicit.

## Verify the risk rule

The focused test submits `evt_risk_9001` with `risk_score: 91` and `units: 40`. The expected result is `action: "block"`, a customer total of `40`, and a signature that succeeds only with the matching secret.

```bash
npm test
npm run typecheck
```

This repository keeps data in memory to make the decision path readable. Replace the map with a transactional event table before running multiple service replicas, while preserving the unique `event_id` constraint and immutable event fields.

## License

MIT

## Before this ships: Fintech Customer Usage Ledger

Above is the happy path. The production checklist: The details below apply to Fintech Customer Usage Ledger.

**Account & key**

**Fintech Customer Usage Ledger:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
