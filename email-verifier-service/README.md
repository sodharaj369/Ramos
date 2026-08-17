# email-verifier-service

A small standalone Go HTTP service that wraps the MIT-licensed
[AfterShip/email-verifier](https://github.com/AfterShip/email-verifier) library.

It performs syntax, DNS/MX, disposable-domain, role-account and **SMTP
reachability** checks and normalizes the result into a stable JSON shape.
It **never sends email** — the SMTP conversation stops before `DATA`.

This service is intentionally isolated: it is **not** wired into the Sales Intel
application, and it should **not** be exposed publicly yet. By default it binds
to `127.0.0.1` only.

## Endpoints

### `GET /health`

```json
{ "status": "ok", "smtp_enabled": true, "time": "2026-08-14T15:44:00Z" }
```

### `POST /verify`

Request:

```json
{ "email": "test@example.com" }
```

Response:

```json
{
  "email": "test@example.com",
  "status": "valid",
  "reachable": "yes",
  "syntax_valid": true,
  "has_mx_records": true,
  "smtp_checked": true,
  "smtp_result": "deliverable",
  "catch_all": false,
  "disposable": false,
  "role_account": false
}
```

`status` is one of: `valid`, `invalid`, `unknown`, `catch_all`, `disposable`, `role`.

`smtp_result` is one of: `deliverable`, `catch_all`, `undeliverable`,
`host_unreachable`, `not_attempted`.

Bulk verification is not implemented — one address per request.

## 1. Run locally without Docker

Requires Go 1.22+.

```sh
cd email-verifier-service
go mod download
go run .
```

Listens on `http://127.0.0.1:8080`.

Configuration (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | Listening port |
| `BIND_ALL` | unset | Set to `true` to bind `0.0.0.0` instead of loopback |
| `SMTP_TIMEOUT_SECONDS` | `8` | Connect + operation timeout for SMTP probes |
| `SMTP_HELO_NAME` | `localhost` | HELO/EHLO hostname |
| `SMTP_FROM_EMAIL` | `verify@localhost` | MAIL FROM address used during the probe |

## 2. Run with Docker

```sh
cd email-verifier-service
docker build -t email-verifier-service .
docker run --rm -p 8080:8080 -e SMTP_TIMEOUT_SECONDS=8 email-verifier-service
```

The image binds `0.0.0.0` inside the container; only publish the port to
`127.0.0.1` if you want to keep it private:

```sh
docker run --rm -p 127.0.0.1:8080:8080 email-verifier-service
```

## 3. Test `/health`

```sh
curl -s http://127.0.0.1:8080/health
```

## 4. Test `/verify`

```sh
curl -s -X POST http://127.0.0.1:8080/verify \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}'
```

Useful cases to try: a real mailbox, a nonexistent mailbox on a real domain,
a role address (`info@…`), and a disposable domain (`…@mailinator.com`).

## 5. SMTP port requirements

SMTP verification opens an **outbound TCP connection on port 25** to the
domain's MX hosts. This must be allowed by your network:

- Most residential ISPs block outbound port 25.
- Most cloud providers (AWS, GCP, Azure, DigitalOcean, Render, Fly, Cloudflare
  Workers, Supabase Edge Functions) block or heavily restrict port 25 by default.
- Ports 465/587 are submission ports for *sending* and are not usable for
  recipient verification.

If port 25 is blocked, the service still returns syntax/DNS/MX/disposable/role
results, with `smtp_result` reporting `host_unreachable` and `status` typically
`unknown`. Run it on a host with outbound port 25 (a VPS with SMTP unblocked, or
a machine behind an SMTP-capable network) for full results.

## 6. Expected limitations

- Port 25 egress is required for SMTP checks (see above).
- Catch-all domains cannot confirm an individual mailbox; `status` becomes
  `catch_all`.
- Large providers (Gmail, Outlook/Microsoft 365, Yahoo) intentionally return
  ambiguous or accept-all responses and may greylist or rate-limit probes —
  expect `unknown` for many of them.
- Results are not cached; every request performs live DNS + SMTP work.
- A single request can take several seconds; timeouts are bounded by
  `SMTP_TIMEOUT_SECONDS` and the server write timeout.
- No bulk endpoint, no retries, no queueing.
- The verifier auto-updates its disposable-domain list, which requires outbound
  HTTPS at startup.

## 7. Security considerations

- **Do not expose this service publicly.** It defaults to `127.0.0.1` for that
  reason. Public exposure turns it into an open MX-probing relay that can get
  your IP blocklisted.
- There is **no authentication** yet. If you ever place it on a network,
  put it behind an authenticated reverse proxy or private network only, and add
  per-caller rate limiting.
- Excessive probing damages sender reputation and can trigger blocklisting of
  your IP by receiving mail servers. Keep volumes low.
- Request bodies are capped (8 KB) and all server timeouts are bounded to limit
  slow-loris and resource-exhaustion abuse.
- Emails submitted for verification are personal data; the service does not log
  addresses or persist any results.
- The container runs as a non-root user with a static binary and no shell tools
  beyond Alpine defaults.
- No email is ever sent — the SMTP session is aborted before message data.

## Sales Intel integration

Sales Intel calls this service only from its authenticated server layer
(`aftership-smtp` provider → `POST /verify`). The browser and the Chrome
extension never talk to it directly.

Environment on the Sales Intel side:

- `EMAIL_VERIFIER_URL` — base URL of this service (e.g. `https://my-verifier.onrender.com`)
- `EMAIL_VERIFIER_API_KEY` — optional shared secret

Environment on this service:

- `SERVICE_API_KEY` — when set, `/verify` requires a matching `X-API-Key`
  (or `Authorization: Bearer <key>`) header and returns 401 otherwise.

Never expose this service publicly without setting `SERVICE_API_KEY`.
