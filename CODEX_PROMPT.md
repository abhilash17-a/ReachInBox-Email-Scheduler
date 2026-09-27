# Codex continuation prompt

You are continuing the ReachInbox hiring assignment implementation in this repository. Do not redesign the architecture unless necessary. Inspect the existing code first.

## Goal
Finish and production-harden the full-stack email scheduler described in README.md and the assignment. Preserve the visual language in `design-reference/`.

## Required stack
- TypeScript + Express
- PostgreSQL + Prisma
- Redis + BullMQ; absolutely no cron libraries or OS cron
- Ethereal SMTP
- Elasticsearch
- React + TypeScript + Tailwind
- Real Google OAuth
- Real Slack OAuth and live Slack notification when an hourly sender limit is reached

## First actions
1. Run `npm install`.
2. Run `npm run db:generate`.
3. Run `npm run build`.
4. Fix all compile errors before adding features.
5. Start Docker services with `docker compose up -d`.
6. Run Prisma migration/seed.
7. Start the app and exercise health, demo login, schedule, queue, and sent flows.

## Important correctness checks
- No cron, node-cron, agenda, setInterval scheduler, or polling scheduler.
- BullMQ delayed jobs must survive API/worker restart.
- Email database rows are the source of truth.
- Worker must atomically claim `SCHEDULED` jobs before sending.
- Redis pacing and hourly counters must be safe across multiple workers.
- Rate-limit hits reschedule jobs; never drop them.
- Slack notification should be deduplicated once per sender/hour.
- Elasticsearch indexes email state and search results must map back to email IDs.
- Google OAuth must be real, not mocked.
- Slack OAuth must be real, not mocked.
- Keep an explicit demo-login route only for local development; do not describe it as the production auth path.
- Add tests for rate limiting/idempotency where practical.

## UI acceptance
Match the supplied screenshots closely:
- Login card with Google button
- Sidebar with user profile, Compose, Scheduled, Sent
- Search/filter controls
- Scheduled/Sent email rows
- Email detail view
- Compose screen with sender, recipients, CSV upload, subject, delay, hourly limit, rich text body, scheduling control, and Send Later
- Settings page with Connect Slack
- Responsive states, loading, empty, and error handling

## Demo acceptance
Make it easy to demonstrate:
1. Login.
2. Upload a CSV with multiple recipients.
3. Schedule with a short delay and low hourly limit.
4. Show Bull Board delayed jobs.
5. Stop backend.
6. Start backend.
7. Show future jobs still execute.
8. Show Ethereal preview.
9. Show Sent emails.
10. Search an email through Elasticsearch.
11. Trigger rate limiting and show a real Slack message after Slack OAuth is configured.

When finished, update README.md with any commands or assumptions discovered during implementation.
