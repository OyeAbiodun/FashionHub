# FashionOS pre-deployment checklist

Run this checklist before any production deployment. It does not replace environment-specific rollout and rollback planning.

## Configuration

- Set `APP_ENV` to a non-development value and disable `DEBUG`.
- Generate a unique, high-entropy `JWT_SECRET_KEY`; never reuse the example or test value.
- Set `DATABASE_URL` to the production PostgreSQL database and verify TLS requirements.
- Set `FRONTEND_URL` to the exact public frontend origin.
- Set frontend `VITE_API_URL` to the public HTTPS API URL.
- Set `COOKIE_SECURE=true`; choose `COOKIE_SAMESITE` for the final same-site or cross-site topology.
- Confirm backups, restore testing, monitoring, log retention, and rollback ownership.

## Database

- Back up the target database.
- Review every pending Alembic migration for constraints, indexes, rollback behavior, and tenant impact.
- Run `alembic upgrade head` in a staging environment with production-like PostgreSQL.
- Confirm `alembic current` reports the expected head.

## Quality gates

```powershell
cd backend
ruff format --check .
ruff check .
pytest -q
pip check
```

```powershell
cd backend
$env:TEST_DATABASE_URL = "postgresql+asyncpg://..."
pytest -m postgres tests/postgres -q
```

```powershell
cd frontend
npx prettier --check .
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm audit --audit-level=high
```

## Smoke test

- Register, sign in, refresh, sign out, and sign back in over the final HTTPS origins.
- Create an isolated tenant and verify customer, measurement, order, payment, invoice, dashboard, and settings workflows.
- Verify a second tenant cannot read or mutate the first tenant's UUIDs.
- Check the invoice on screen and in print preview at mobile, tablet, laptop, and desktop widths.
- Confirm security and CORS headers, health checks, structured error responses, and secret-free logs.
- Remove all smoke-test tenant data after verification.
