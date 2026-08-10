# ADR 0001: Keep V2 as a modular monolith

Status: Accepted for V2 planning — 2026-08-10

## Context

V1 is one React application, one FastAPI service, and one PostgreSQL database. V2 adds connected operational domains, but the current team/product scale does not justify distributed transactions, independent deployment, duplicated identity/tenant infrastructure, or network failure modes.

## Decision

Build V2 as a modular monolith. Identity, Tenant, CRM, Orders, Production, Inventory, Finance, Communication, Customer Experience, Reporting, and Entitlements own explicit code/data boundaries inside the existing deployable. Cross-module writes use application-service orchestration; reporting uses read contracts. No module mutates another module's private tables casually.

## Consequences

- Transactions, migrations, local development, and tenant enforcement remain understandable.
- Module boundaries require review and tests even though Python cannot enforce them automatically.
- A future extraction remains possible if measured scaling/ownership needs arise, but V2 adds no microservices, event streaming, or Kubernetes.
