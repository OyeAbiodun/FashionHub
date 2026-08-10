# FashionOS Agent Guide

## Product Purpose
FashionOS is a multi-tenant SaaS foundation for Nigerian fashion designers and tailoring businesses replacing notebooks and scattered WhatsApp records.

## Architecture Map
- `backend/`: FastAPI API, async SQLAlchemy models, Alembic migrations, pytest suite.
- `frontend/`: React + Vite + TypeScript application with cookie-based authentication.
- `docker-compose.yml`: Local PostgreSQL service for development.

## Development Commands
- Start database: `docker compose up -d postgres`
- Backend install: `cd backend && python -m pip install -e ".[dev]"`
- Frontend install: `cd frontend && npm install`
- Backend dev server: `cd backend && uvicorn app.main:app --reload`
- Frontend dev server: `cd frontend && npm run dev`

## Testing Commands
- Backend tests: `cd backend && pytest`
- Backend lint: `cd backend && ruff check .`
- Frontend tests: `cd frontend && npm run test -- --run`
- Frontend lint: `cd frontend && npm run lint`
- Frontend type check: `cd frontend && npm run typecheck`
- Frontend build: `cd frontend && npm run build`

## Database Migration Rules
- Models are the source of truth for schema shape.
- Generate migrations with Alembic, then review the generated SQL and constraints before committing.
- Never hand-edit production data in migrations unless the migration documents the rollback and tenant impact.
- PostgreSQL-only integration tests must require `TEST_DATABASE_URL` and verify `current_database() = 'fashionos_test'` before cleanup or other destructive test operations.

## Tenant-Isolation Rule
Every tenant-owned query must filter by `business_id` derived from the authenticated user/session. Never trust a browser-provided `business_id` for authorization.
For customer records, cross-tenant misses must return `404` and behave as if the record does not exist.

## Authentication Security Rules
- Access and refresh tokens live only in HTTP-only cookies.
- Do not store tokens in `localStorage` or expose password hashes.
- Use generic login errors for unknown email and wrong password.
- Require a real `JWT_SECRET_KEY` in every non-test environment.

## Coding Conventions
- Keep API routes thin; put business logic in services.
- Use typed Pydantic schemas for request and response boundaries.
- Prefer explicit async SQLAlchemy queries.
- Add comments only when they clarify non-obvious intent.
- Customer phone normalization strips surrounding whitespace and removes spaces, hyphens, dots, and brackets before uniqueness checks.
- Customer archiving is a soft delete via `archived_at`; never hard-delete customer rows.
- Customer list APIs use `page`, `page_size`, `total`, and `total_pages`, with `page_size` capped at 100.
- Order numbers are business-scoped and generated from `order_counters`; never derive them from counts or accept them from clients.
- Order item measurement profiles must belong to the same business and same customer as the order.
- Order status changes must go through the dedicated status service path and append `OrderStatusHistory`.
- Delivered and cancelled orders are terminal in the MVP.
- Store and calculate money with Decimal-compatible fixed precision; never use float for authoritative values.
- Successful payment records are the source of truth for amount paid, and balances are always derived.
- Never add or accept an editable `amount_paid`; invoices and payments must always be tenant scoped.
- Dashboard metrics and alerts must be derived from authoritative records and every dashboard query must be tenant scoped.
- Reuse authoritative Decimal-safe financial calculations for dashboard totals and balances.
- Calendar metrics use business-local dates and month boundaries through the centralized timezone helpers; invalid timezones fall back safely.
- Business settings must always be read and updated from the authenticated session tenant; never accept `business_id` in settings payloads.
- Validate business currency against the supported allowlist and timezone against IANA zone data at the API boundary.
- Business logo branding is URL-based until a managed file-storage subsystem exists; keep a graceful UI fallback for missing or broken URLs.
- Propagate saved business identity, currency, timezone, invoice notes, and invoice footer through the auth cache and every dependent screen or document.
- Preserve the existing business-scoped order and invoice counter formats unless a future migration explicitly defines prefix collision and rollback behavior.

## Frontend Design Conventions
- Reuse the shared primitives in `frontend/src/components/ui.tsx` for page structure, cards, buttons, fields, badges, dialogs, and common loading, empty, error, and success states.
- Use semantic design tokens and status badges consistently; never rely on color alone to communicate status.
- Keep navigation limited to implemented routes and actions. Do not add placeholder modules, dead controls, or speculative settings.
- Design mobile-first, preserve visible focus states, label icon-only controls, and keep dialogs keyboard dismissible.
- Format authoritative money and dates through the centralized helpers in `frontend/src/lib`; do not duplicate formatting logic in screens.
- Keep desktop tables paired with readable mobile card/list presentations when the same operational data must work at narrow widths.

## Definition of Done
- Required tests pass or failures are documented with exact causes.
- Lint, type-check, and build commands have been run where the environment permits.
- Migration changes have been reviewed for constraints, indexes, and tenant safety.
- No secrets, password hashes, or tokens are committed or returned by APIs.
