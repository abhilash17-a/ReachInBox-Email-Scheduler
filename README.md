# ReachInbox – Full-stack Email Job Scheduler

A production-style hiring assignment implementation using TypeScript, Express, React, PostgreSQL, Redis, BullMQ, Elasticsearch, Ethereal SMTP, Google OAuth, and Slack OAuth.

## Architecture

- PostgreSQL is the source of truth for users, campaigns, email jobs, senders, Slack connections, and status.
- The dashboard reads only records owned by the authenticated account; it does not generate or seed sample email rows.
- BullMQ + Redis stores delayed jobs persistently. There are no cron jobs or in-memory schedulers.
- A worker pool consumes jobs with configurable concurrency.
- Redis-backed atomic rate limiting enforces an hourly sender limit across workers/instances.
- Redis-backed sender pacing enforces a minimum delay between sends across workers/instances.
- Ethereal SMTP sends test mail.
- Elasticsearch indexes searchable email metadata and content after state changes.
- Email stars are persisted in PostgreSQL; deleting an email removes its database and search record and cancels a pending queue job.
- Bull Board exposes live BullMQ queue visibility at `/admin/queues`.
- Google OAuth signs users in and redirects to the dashboard.
- Slack OAuth stores a per-user Slack access token and posts a live notification when an hourly sender limit is reached.

## Run locally

1. Install Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `backend/.env` and fill Google/Slack credentials if you want live OAuth.
3. Start infrastructure:

```bash
docker compose up -d
```

4. Install dependencies:

```bash
npm install
```

5. Generate Prisma client and migrate:

```bash
npm run db:generate
npm run db:migrate
npm run seed
```

6. Start the frontend, API, and separate BullMQ worker:

```bash
npm run dev
```

The API and worker each reconcile scheduled database rows on startup, so missing queue entries are restored and either process can restart independently.

Frontend: http://localhost:5173
API: http://localhost:4000
Bull Board: http://localhost:4000/admin/queues
Kibana: http://localhost:5601

## Vercel and free hosting

Vercel Hobby can host the Vite frontend. Import this GitHub repository into Vercel and set the project **Root Directory** to `frontend`; Vercel detects Vite and builds the `dist` directory. Add `VITE_API_URL` as a frontend build environment variable pointing at the public HTTPS origin of the separately hosted API.

The whole scheduler cannot run reliably on Vercel Hobby by itself. The API currently starts a persistent Express server, and a separate BullMQ worker must stay alive to process delayed jobs. Vercel Functions have bounded request lifetimes and are not a continuously running worker host. Keep the API and worker on an always-on Node host, and provision external PostgreSQL, Redis, and Elasticsearch services. Configure `FRONTEND_URL`, `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL`, `SESSION_SECRET`, `GOOGLE_CALLBACK_URL`, `SLACK_REDIRECT_URI`, and the OAuth credentials on the backend host. Set the matching Google and Slack callback URLs to the backend's public HTTPS domain, and configure CORS/session cookies for the Vercel site domain.

The currently available free Render services are suitable for a preview but not for reliable scheduled delivery: free web services sleep when idle, free PostgreSQL databases expire after 30 days, and Render blocks outbound SMTP ports including Ethereal's port 587. Do not deploy the worker there if the requirement is that scheduled messages execute reliably. Ethereal is a test inbox service; it captures previews and does not deliver messages to real recipient inboxes. A dependable deployment therefore needs an always-on worker host and a network path that permits SMTP to Ethereal, which may not be fully free.

No provider secrets belong in the repository. Use each host's environment-variable settings for secrets, and never commit `.env` files.

## Ethereal test mail

All messages are sent through Ethereal SMTP for this assignment. Ethereal captures them in a test inbox and returns a preview URL; it does **not** deliver messages to recipients' real inboxes. The app marks a message `SENT` only after Ethereal accepts the recipient, and the email detail page explains this and links to the preview. If `ETHEREAL_USER` and `ETHEREAL_PASS` are empty, development mode automatically creates a test account.

## Google OAuth

Create a Google OAuth web client and configure:

`http://localhost:4000/api/auth/google/callback`

The frontend uses `/api/auth/google` and the backend issues an HTTP-only session cookie after callback.

## Slack OAuth

Create a Slack app, enable OAuth, and add the `chat:write` and `im:write` bot scopes, then add:

`https://YOUR-ACTUAL-TUNNEL-HOST/api/slack/oauth/callback`

Slack requires an HTTPS callback. Start a tunnel to local port 4000, set `SLACK_REDIRECT_URI` to the tunnel's actual forwarding hostname plus `/api/slack/oauth/callback`, and register that exact URL under Slack app **OAuth & Permissions → Redirect URLs**. Do not leave the example hostname in `.env`; keep the tunnel running during authorization. The app uses the same configured URL in both the authorize request and access-token exchange.

The Connect Slack button starts the real OAuth flow. The app opens a direct message with the connecting Slack user when a sender reaches its hourly limit. If no Slack connection exists, rate-limit events do not fail the email job.

## Scheduling and restart behavior

Each recipient gets a durable database row and a BullMQ delayed job. The BullMQ job ID is stored on the email record, and each campaign recipient/sequence has a unique database idempotency key. On API and worker startup, scheduled rows are re-enqueued with their existing job IDs, which repairs jobs if a process stopped between the database write and queue insertion. BullMQ retains delayed jobs in Redis across restarts, and PostgreSQL remains authoritative. Workers claim a row with an atomic `SCHEDULED` to `PROCESSING` transition before SMTP delivery, so duplicate queue deliveries cannot both send the same row. A stable SMTP message ID is derived from the email row.

Campaigns and per-recipient email status are persisted in PostgreSQL. Small attachments (up to five files and 5 MB combined) are stored as campaign JSON metadata with base64 content and included in the Ethereal SMTP message. Keep attachments small; production binary storage should use object storage.

## Rate limiting

Two Redis-backed controls are applied:

1. Minimum delay: a sender-specific atomic Redis lock stores the last send timestamp. If a worker gets a job too early, the job is rescheduled rather than failed.
2. Hourly limit: a sender/hour Redis counter is incremented atomically. When the configured limit is reached, the job is rescheduled to the next UTC hour boundary.

The default minimum is 2 seconds per sender (`DEFAULT_MIN_DELAY_MS`). A campaign may request a longer interval; the API clamps shorter requests to the configured minimum. The hourly limit is configurable with `DEFAULT_HOURLY_LIMIT` or per campaign. Hour counters use an atomic Redis Lua operation keyed by sender and UTC hour, so parallel workers cannot overshoot the configured limit. Rate-limited jobs are moved to the next UTC hour rather than dropped. Slack notification claims are also deduplicated in Redis by user, sender, and UTC hour; a failed Slack API call releases the claim so another limit hit can retry it.

## 1000+ simultaneous emails

The API writes all email rows first, indexes them in Elasticsearch, and inserts their delayed jobs in BullMQ batches with deterministic IDs. Worker concurrency (`WORKER_CONCURRENCY`) limits active SMTP operations. The Redis sender controls prevent multiple workers from violating pacing or hourly quotas. Jobs beyond the hourly quota are moved to the next available hour rather than dropped.

## Search

`GET /api/emails/search?q=term` searches Elasticsearch for recipient, subject, body, and status. PostgreSQL remains authoritative for lifecycle state.

The Scheduled and Sent views include status filters. Scheduled rows show their next scheduled time, including the next attempt after hourly rate-limit rescheduling. Email detail supports persistent starring, downloading as `.eml` (including campaign attachments), copying recipient/subject, and confirmed deletion.

## Demo checklist

- Login with Google.
- Compose an email to several recipients or upload a CSV.
- Set start time, delay, and hourly limit.
- Show Scheduled Emails.
- Open Bull Board and show delayed jobs.
- Stop the worker before a scheduled job executes.
- Start the worker again and show the job survives.
- Open the Ethereal preview URL and show the captured message.
- Show Sent Emails and Elasticsearch search.
- Configure a low hourly limit and connect Slack; schedule enough recipients to trigger a live Slack notification.

## Trade-offs

- Ethereal is intentionally used instead of a real provider because the assignment asks for test SMTP.
- OAuth secrets are environment configuration and never committed.
- Small attachments (up to five files and 5 MB combined) are persisted with campaign content; production-scale binary storage should use object storage.
- Bull Board is protected by simple basic auth in this assignment; a production deployment should put it behind SSO/network controls.
