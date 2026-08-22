# FashionOS Session 12 launch checklist

Record the owner, timestamp, production URLs, database project/name, release `v0.1.0`, and result for each item. Never paste secrets or full database URLs into this document or deployment logs.

## Pre-launch

- [ ] Hosting platforms and stable HTTPS frontend/API URLs are selected; TLS certificates are active.
- [ ] Managed PostgreSQL is created with TLS, the exact database identity is confirmed, and connection succeeds.
- [ ] Production variables match the safe example files; the JWT secret is persistent and stored only in the platform secret manager.
- [ ] `DEBUG=false`, `COOKIE_SECURE=true`, `VITE_API_URL` is the HTTPS API base, and no browser bundle contains secrets.
- [ ] `FRONTEND_URL` is the exact frontend origin; credentialed CORS does not use a wildcard or include localhost.
- [ ] `COOKIE_SAMESITE=lax` is used for same-site domains, or `none` is deliberately chosen for cross-site hosting with the trusted-origin protection verified.
- [ ] Managed backup retention and restore owner are recorded; a fresh logical backup exists before migrating a database with data.
- [ ] Pending migrations are reviewed, the production database reports the expected current revision, and one pre-deploy job runs `python -m alembic upgrade head` exactly once.
- [ ] `python -m alembic current` reports `20260822_0014 (head)` and system measurement templates exist.
- [ ] `PLATFORM_EMAIL_ENCRYPTION_KEY` is held only in the server-side secret manager and Platform Email Configuration has been securely tested by a Super Admin.
- [ ] Provider health check targets `GET /api/v1/health` and returns app running/database reachable.
- [ ] Backend tests, PostgreSQL integration tests, frontend tests, lint, type-check, production build, dependency checks, and high-severity audit are green.
- [ ] Repository scan is clean: no secrets or production `.env`, database dumps, SQLite files, QA data, or local logs are deployed.
- [ ] Provider logs show clean startup and no traceback/credential leakage; rollback owner and previous image are known.

## Production smoke

- [ ] Register a temporary business through the normal UI; log out and log in again.
- [ ] Create a customer and confirm a second QA tenant cannot access the customer's UUID.
- [ ] Add and view a measurement profile.
- [ ] Create and price an order; update its production status.
- [ ] Record a payment, generate/view an invoice, and confirm dashboard totals and alerts update.
- [ ] Update business settings and confirm branding/currency/timezone behavior.
- [ ] Refresh `/dashboard`, `/customers`, `/measurements`, `/orders`, and `/settings` directly without a hosting 404.
- [ ] At mobile width, verify login, dashboard, customers, measurements, orders, order detail, and settings have no horizontal overflow.
- [ ] In invoice print preview, verify A4 layout, hidden shell/buttons, visible branding, and readable totals.
- [ ] Verify API security headers, exact CORS, secure HTTP-only auth cookies, generic login errors, and no user-visible traceback.
- [ ] Remove temporary QA tenant data where practical and record any retained test data.

## Post-launch

- [ ] Monitor API/platform/database logs and `/api/v1/health` during and after rollout.
- [ ] Verify the first automated backup completes, then restore a backup into an isolated database and record the result.
- [ ] Onboard 5–10 trusted fashion businesses with hands-on support and direct feedback.
- [ ] Manually track customers created, measurements saved, orders created, payments recorded, and weekly active businesses; do not add launch-only analytics infrastructure.

## Bug triage

1. Critical security or data-loss issue: stop affected workflows, preserve evidence, notify the owner, and hotfix or roll back immediately.
2. Blocking workflow bug: reproduce, scope tenant/data impact, prioritize the smallest safe patch, and rerun release gates.
3. UX issue: record context and impact, then schedule after launch blockers.
4. Feature request: log it for Phase 2; do not expand the MVP during launch stabilization.
