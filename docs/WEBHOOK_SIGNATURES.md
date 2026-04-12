# FieldTrack Webhook Signature Verification

Every outbound webhook request from FieldTrack includes security headers that allow receivers to verify authenticity and reject replayed requests.

---

## Headers

| Header | Example value | Purpose |
|---|---|---|
| `X-FieldTrack-Signature` | `sha256=a3f1c8...` | HMAC-SHA256 of the signing body (see below) |
| `X-Webhook-Signature` | `sha256=a3f1c8...` | Compatibility alias of `X-FieldTrack-Signature` |
| `X-FieldTrack-Timestamp` | `1711618200` | Unix timestamp **in seconds** at delivery time |
| `X-Webhook-Timestamp` | `1711618200` | Compatibility alias of `X-FieldTrack-Timestamp` |
| `X-FieldTrack-Event` | `employee.checked_in` | Logical event type for routing |
| `X-FieldTrack-Delivery-Id` | `1b2f...-uuid` | Unique delivery attempt id for idempotency / replay dedupe |

---

## Signing algorithm

```
signing_body = "<timestamp>.<raw_request_body>"
signature    = "sha256=" + hex( HMAC-SHA256( secret, signing_body ) )
```

Where:
- `<timestamp>` is the value of `X-FieldTrack-Timestamp` (decimal string, no padding)
- `<raw_request_body>` is the **exact** bytes of the HTTP request body (UTF-8 JSON, no re-serialisation)
- `secret` is the **per-webhook signing secret** shown in the FieldTrack webhooks dashboard
- The HMAC key is the raw UTF-8 string of the secret (not Base64-decoded)
- Dot (`.`) is the separator between timestamp and body

### Why timestamp-bound?

Including the timestamp in the signing input means the same payload signed at a different time produces a different signature.  This prevents _replay attacks_: a valid request captured by a MITM cannot be replayed after the tolerance window expires.

**Receivers MUST reject requests where `|now - timestamp| > 300 seconds` (5 minutes).**

---

## Verification steps (receiver side)

1. Extract `X-FieldTrack-Timestamp` → `ts` (integer)
2. Verify `|time.now() - ts| <= 300` — reject with HTTP 400 if stale.
3. Construct `signing_body = ts + "." + request_body_string`
4. Compute `expected = "sha256=" + hex(HMAC-SHA256(secret, signing_body))`
5. Compare `expected` to `X-FieldTrack-Signature` using a **timing-safe** equality function.
6. Reject with HTTP 401 if signatures do not match.
7. Optional replay guard: store `X-FieldTrack-Delivery-Id` for 24 h and reject duplicates.

> ⚠ **Never** use regular string equality (`==`) to compare signatures — it is vulnerable to timing attacks. Always use `hmac.compare_digest` (Python) or `crypto.timingSafeEqual` (Node.js).

---

## Node.js verification example

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const TOLERANCE_SECONDS = 300;

function verifyFieldTrackWebhook(
  rawBody: string,
  secret: string,
  receivedSignature: string,
  receivedTimestamp: string,
): boolean {
  // 1. Validate timestamp within tolerance window
  const ts  = parseInt(receivedTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(ts) || Math.abs(now - ts) > TOLERANCE_SECONDS) {
    return false; // stale or malformed timestamp
  }

  // 2. Reconstruct signing body
  const signingBody = `${ts}.${rawBody}`;

  // 3. Compute expected signature
  const hmac     = createHmac("sha256", secret);
  hmac.update(signingBody, "utf8");
  const expected = `sha256=${hmac.digest("hex")}`;

  // 4. Timing-safe comparison
  if (expected.length !== receivedSignature.length) return false;
  return timingSafeEqual(
    Buffer.from(expected,          "utf8"),
    Buffer.from(receivedSignature, "utf8"),
  );
}

// ── Express / raw middleware example ─────────────────────────────────────────

import express from "express";

const app = express();

// Must use raw body middleware — JSON.parse() changes byte representation.
app.use("/webhooks/fieldtrack", express.raw({ type: "application/json" }));

app.post("/webhooks/fieldtrack", (req: IncomingMessage & { body: Buffer }, res: ServerResponse) => {
  const rawBody   = (req as express.Request).body.toString("utf8");
  const signature = (req as express.Request).headers["x-fieldtrack-signature"] as string ?? "";
  const timestamp = (req as express.Request).headers["x-fieldtrack-timestamp"] as string ?? "";
  const secret    = process.env.FIELDTRACK_WEBHOOK_SECRET ?? "";

  if (!verifyFieldTrackWebhook(rawBody, secret, signature, timestamp)) {
    res.writeHead(401);
    res.end("Invalid signature");
    return;
  }

  const event = JSON.parse(rawBody);
  console.log("Received event:", event.type);
  res.writeHead(200);
  res.end("OK");
});
```

---

## Python verification example

```python
import hashlib
import hmac
import time
from flask import Flask, request, abort

TOLERANCE_SECONDS = 300
app = Flask(__name__)


def verify_fieldtrack_webhook(
    raw_body: bytes,
    secret: str,
    received_signature: str,
    received_timestamp: str,
) -> bool:
    # 1. Validate timestamp within tolerance window
    try:
        ts = int(received_timestamp)
    except (ValueError, TypeError):
        return False

    if abs(time.time() - ts) > TOLERANCE_SECONDS:
        return False  # stale

    # 2. Reconstruct signing body (bytes)
    signing_body = f"{ts}.".encode() + raw_body

    # 3. Compute expected signature
    mac      = hmac.new(secret.encode("utf-8"), signing_body, hashlib.sha256)
    expected = "sha256=" + mac.hexdigest()

    # 4. Timing-safe comparison
    return hmac.compare_digest(expected, received_signature)


@app.route("/webhooks/fieldtrack", methods=["POST"])
def receive_webhook():
    raw_body  = request.get_data()           # raw bytes before JSON decode
    signature = request.headers.get("X-FieldTrack-Signature", "")
    timestamp = request.headers.get("X-FieldTrack-Timestamp", "")
    secret    = "your-webhook-secret-here"   # from FieldTrack dashboard

    if not verify_fieldtrack_webhook(raw_body, secret, signature, timestamp):
        abort(401, "Invalid signature")

    event = request.get_json()
    print(f"Received event: {event['type']}")
    return "", 200
```

---

## Common mistakes

| Mistake | Impact | Fix |
|---|---|---|
| Re-serialising the body before signing (e.g. `json.dumps(json.loads(body))`) | Signature mismatch on any non-canonical JSON | Hash the **raw bytes** received over the wire |
| Skipping the timestamp check | Replay attacks possible indefinitely | Always validate `\|now - ts\| <= 300` |
| Using `==` for signature comparison | Timing oracle leaks partial secret | Use `hmac.compare_digest` / `timingSafeEqual` |
| Decoding the secret from Base64 | Wrong key bytes → signature always fails | Use the secret string as-is (UTF-8) |
| Signing `body` instead of `timestamp.body` | Valid signatures but no replay protection | Always prepend timestamp + dot |

---

## Rotating secrets

1. Generate a new secret in the FieldTrack webhooks dashboard.
2. Update your receiver to accept **both** the old and new secret during a transition window (check both; accept if either matches).
3. Once all in-flight requests have been delivered, remove the old secret check.

FieldTrack re-signs all new deliveries with the new secret immediately upon rotation; retries of existing deliveries use the secret active at the time of the original enqueue.
