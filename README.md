# FashionOS

FashionOS is a multi-tenant SaaS foundation for Nigerian fashion designers and tailoring businesses. It includes authentication, tenant-aware customer and measurement management, orders and production tracking, pricing, payments, invoices, and a live operational dashboard.

## Prerequisites
- Python 3.12+
- Node.js 20+
- Docker Desktop or another Docker Compose-compatible runtime

## Environment Setup
Copy the sample environment files:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Set `JWT_SECRET_KEY` in `backend/.env` before starting the API.

## Starting PostgreSQL

```powershell
docker compose up -d postgres
```

The default database URL is:

```text
postgresql+asyncpg://fashionos:fashionos@localhost:5432/fashionos
```

## Backend Installation

```powershell
cd backend
python -m pip install -e ".[dev]"
```

## Running Migrations

```powershell
cd backend
alembic upgrade head
```

## Optional PostgreSQL Integration Validation

The normal backend suite remains isolated on in-memory SQLite for fast, portable unit testing. PostgreSQL-only locking, counter, and transaction checks are opt-in and require the explicitly configured `fashionos_test` database.

Keep the connection URL in ignored `backend/.env` or a temporary environment variable; never commit its password. After migrating the test database to head, run:

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+asyncpg://fashionos_user:<local-password>@localhost:5432/fashionos_test"
python -m pytest -m postgres tests/postgres -q
```

The integration fixture refuses to run unless `current_database()` is exactly `fashionos_test`. Omitting `TEST_DATABASE_URL` skips these tests without affecting the normal suite.

## Customer Management
- Customer records belong to the authenticated business automatically; clients never submit `business_id`.
- Customer phone uniqueness is scoped per business using normalized phone numbers.
- Phone normalization strips surrounding whitespace and removes spaces, hyphens, dots, and brackets. Nigerian numbers are otherwise preserved.
- Archiving a customer sets `archived_at` and preserves the row. Archived customers are excluded from default lists and can be queried with `archived=true`.
- Customer list responses use `{ items, page, page_size, total, total_pages }`; `page_size` is capped at 100.

## Password resets

- Reset credentials are random, hashed at rest, expire after 15 minutes, and are invalidated after use.
- The forgot-password API always returns the same generic response and never returns a usable reset token.
- FashionOS sends reset links through its configured transactional provider. `EMAIL_PROVIDER=capture` records messages only for development/tests; production requires the FashionOS-managed `resend` provider, sender identity, and API key.
- Reset requests are throttled by HMAC-hashed email identity and source IP. Provider credentials are platform configuration, never business settings.

## Orders and Production
- Order numbers are generated per business from `order_counters`, producing references like `ORD-000001`; clients never submit `order_number`.
- New orders default to `CONFIRMED` and must include at least one garment item.
- Each order item may reference its own measurement profile; profiles must belong to the order customer and active archived profiles cannot be attached to new orders.
- Status flow is `DRAFT -> CONFIRMED -> CUTTING -> SEWING -> FITTING/FINISHING -> READY -> DELIVERED`, with `CANCELLED` allowed from non-terminal production states.
- `DELIVERED` and `CANCELLED` are terminal and cannot transition or be edited in the MVP.
- Every status change appends an order status history record.
- Overdue means `due_date` is before the business-local date and status is not `DELIVERED` or `CANCELLED`.
- Order APIs use the same pagination shape as customers: `{ items, page, page_size, total, total_pages }`.

## Pricing, Payments, and Invoices
- Money is stored as `NUMERIC(12,2)` and calculated with Python `Decimal`; API decimal values are serialized as strings.
- Existing order items receive `unit_price = 0.00` during migration so development data remains valid.
- `subtotal = sum(quantity × unit_price)`, `total = subtotal - discount_amount`, `amount_paid = sum(SUCCESSFUL payments)`, and `outstanding_balance = total - amount_paid`.
- Discounts cannot be negative or exceed the current subtotal. Pricing and discounts are locked once an order is delivered or cancelled.
- Manually recorded payments are immutable ledger-like rows and default to `SUCCESSFUL`. Pending, failed, and refunded records do not count as paid. Successful overpayments are rejected.
- Payment creation locks the tenant-scoped order row while checking its balance. PostgreSQL therefore serializes concurrent payments near the remaining balance; SQLite tests cannot exercise row-lock semantics.
- Invoice numbers come from a business-scoped, row-locked `invoice_counters` table (`INV-000001`). Each order can have at most one invoice.
- Invoices are issued immediately. Their persisted status is synchronized after pricing/payment changes and defensively derived when fetched: `ISSUED`, `PARTIALLY_PAID`, or `PAID` (with `CANCELLED` reserved).
- Invoice line details remain linked to live order pricing. Terminal order financial locking makes delivered invoices stable.
- View invoices at `/invoices/:invoiceId` and use the Print action for a navigation-free browser printout.

Financial endpoints:
- `POST/GET /api/v1/orders/{order_id}/payments`
- `GET /api/v1/customers/{customer_id}/payments`
- `POST/GET /api/v1/orders/{order_id}/invoice`
- `GET /api/v1/invoices/{invoice_id}`

## Dashboard and Operational Alerts
- Dashboard values are derived from tenant-scoped customer, order, item, and payment records; no dashboard totals are stored.
- Customers counts non-archived customers. Active orders excludes `DELIVERED` and `CANCELLED`. Due today and overdue use the business-local date.
- Collected this month sums only `SUCCESSFUL` payments inside the current business-local calendar month. The local month boundaries are converted to UTC for the payment query.
- Outstanding balance sums positive order totals less successful payments for all non-cancelled orders. Delivered orders remain included until fully paid.
- Operational alerts are derived on request for overdue, due-today, ready-for-pickup, ready-with-balance, and delivered-unpaid orders; alerts are not persisted.
- Business calendar calculations use the configured IANA timezone. Missing or invalid values safely fall back to `Africa/Lagos`.

Dashboard endpoints:
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/due-orders`
- `GET /api/v1/dashboard/recent-orders`
- `GET /api/v1/dashboard/recent-payments`
- `GET /api/v1/dashboard/alerts`

## Business Settings and Invoice Identity
- Authenticated owners and staff can manage their current tenant at `/settings`; the API derives the business from the session and never accepts a browser-provided tenant ID.
- Business profile, URL-based logo branding, currency, timezone, default invoice notes, and invoice footer are available through `GET/PATCH /api/v1/business`.
- Supported currencies are NGN, USD, GBP, EUR, GHS, KES, and ZAR. Timezones use validated IANA names.
- Saved identity is reflected immediately in the application shell, dashboard, order and payment money formatting, production timestamps, and printable invoices.
- Logos use public HTTP(S) URLs with an in-app fallback. FashionOS does not store uploaded logo files in this release.
- Existing order and invoice number prefixes are intentionally unchanged; counters remain the authoritative, tenant-safe numbering mechanism.

## Starting FastAPI

```powershell
cd backend
uvicorn app.main:app --reload
```

API docs are available at `http://127.0.0.1:8000/docs`.

## Frontend Installation

```powershell
cd frontend
npm install
```

## Starting React

```powershell
cd frontend
npm run dev
```

The app runs at `http://127.0.0.1:5173`.

## Running Tests

```powershell
cd backend
pytest
```

```powershell
cd frontend
npm run test -- --run
```

## Linting and Formatting

```powershell
cd backend
ruff check .
ruff format .
```

```powershell
cd frontend
npm run lint
npm run format
```

## Troubleshooting
- Missing `JWT_SECRET_KEY`: create `backend/.env` and set a strong secret.
- Database connection errors: confirm Docker is running and `docker compose ps` shows PostgreSQL healthy.
- CORS or cookie issues: leave `VITE_API_URL` blank for local development so the API uses the Vite page hostname; `localhost` and `127.0.0.1` are both allowed development origins. Keep `COOKIE_SECURE=false` locally.
- Production frontend/API split: set `VITE_API_URL` to the public HTTPS API URL, set `FRONTEND_URL` to the exact public frontend origin, and enable secure cookies.
- Migration import errors: install backend dependencies with `python -m pip install -e ".[dev]"`.

## Production deployment (v0.1.0)

FashionOS is prepared for a provider-neutral deployment: a static React container over HTTPS, a persistent FastAPI container over HTTPS, and managed PostgreSQL over TLS. Copy values from `backend/.env.production.example` and `frontend/.env.production.example` into the hosting platform's environment/secret manager; do not create production `.env` files in the repository.

Required backend values are `APP_NAME`, `APP_ENV=production`, `DEBUG=false`, `API_PREFIX`, `FRONTEND_URL`, `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_ALGORITHM`, token lifetimes, `COOKIE_SECURE=true`, and `COOKIE_SAMESITE`. The frontend requires public configuration `VITE_API_URL`; it must be the HTTPS API base including `/api/v1`. A production process refuses local or non-TLS PostgreSQL, an HTTP frontend, an insecure cookie, debug mode, or a JWT key shorter than 32 characters. Provider `postgresql://` URLs and `sslmode=require` are normalized for async SQLAlchemy/asyncpg.

Build and run the backend image without development reload:

```bash
docker build -t fashionos-api:v0.1.0 ./backend
docker run --rm -p 8000:8000 --env-file /secure/path/fashionos-api.env fashionos-api:v0.1.0
```

Build the frontend with its public API URL embedded at build time:

```bash
docker build --build-arg VITE_API_URL=https://api.example.com/api/v1 -t fashionos-web:v0.1.0 ./frontend
docker run --rm -p 8080:8080 fashionos-web:v0.1.0
```

The frontend container serves fingerprinted assets with long-lived caching, serves `index.html` without permanent caching, and rewrites application routes to `index.html`. Provider-native static hosting is also valid if it applies the same SPA fallback.

### Production migrations

Migrations are an explicit, single pre-deploy operation; they are not run by each API worker. Before running one, verify the provider project/database identity and connection, inspect the pending revisions, and take a backup if the database contains data. From a one-off backend shell configured with the production secrets:

```bash
python -m alembic current
python -m alembic history --indicate-current
python -m alembic upgrade head
python -m alembic current
```

The final command must report `20260820_0013 (head)`. On a first empty database, running base-to-head creates the schema and system measurement templates. Confirm `/api/v1/health` returns `{"status":"ok","database":"reachable"}` after the API starts. Do not use `stamp head`, run downgrades automatically, or run the PostgreSQL concurrency suite against production.

### Cookies, CORS, HTTPS, and errors

Use stable HTTPS frontend and API URLs. `FRONTEND_URL` is the one exact credentialed CORS origin; development loopback aliases are never added in production. Same-site subdomains such as `app.example.com` and `api.example.com` should use `COOKIE_SAMESITE=lax` with secure, HTTP-only cookies. If unrelated provider domains make the deployment cross-site, use `COOKIE_SAMESITE=none` only with `COOKIE_SECURE=true`; FashionOS additionally rejects state-changing production requests unless their `Origin` exactly matches `FRONTEND_URL`.

TLS terminates at the hosting provider. Uvicorn logs startup and request failures to standard output, Alembic logs migration failures, and `DEBUG=false` prevents browser tracebacks. Never enable request/header/body logging that could capture passwords, JWTs, cookies, or database URLs. Configure the provider health check as `GET /api/v1/health`.

### Backups, restore, and launch verification

Enable managed daily backups and point-in-time recovery when the provider offers them, record retention and restore ownership, and test a restore before onboarding real customers. Also take a logical backup before migrations or material releases, using the provider's standard PostgreSQL connection URL without printing it:

```bash
pg_dump --format=custom --no-owner --no-acl --file=fashionos-YYYYMMDD.dump "$PG_BACKUP_URL"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$PG_RESTORE_URL" fashionos-YYYYMMDD.dump
```

Restore into an isolated database first, then verify the Alembic revision, row counts, tenant boundaries, and health. Keep dumps encrypted and outside the repository.

Complete [the Session 12 launch checklist](docs/SESSION_12_LAUNCH_CHECKLIST.md) against the final production URLs. The smoke account must register through the normal UI; no administrator is hardcoded. Remove the temporary QA tenant before public launch where practical.
