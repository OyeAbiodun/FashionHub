# FashionOS V2 API conventions

V2 extends the existing `/api/v1` API unless a breaking contract truly requires a version boundary. Do not rename stable V1 routes for aesthetics. New endpoints follow these conventions.

## Authentication, actor, and tenant

- Access/refresh credentials remain HTTP-only cookies. Tokens are never returned in bodies or stored in browser storage.
- V2.1 uses the existing authenticated user/business dependency through an actor-context adapter. V2.2 evolves it to `ActorContext(user_id, membership_id, business_id, role, permissions)`.
- Clients never submit `business_id` on ordinary domain requests. Workspace switching accepts `membership_id` only as a selector and verifies it belongs to the current user and is active.
- Every tenant-owned lookup includes the actor-derived `business_id`. Never fetch by UUID and authorize afterward when one scoped query is possible.
- Cross-tenant or nonexistent resource IDs return the same `404`. A known current-tenant resource with insufficient permission returns `403`.

## Permission and entitlement enforcement

- Routes declare named permissions such as `production.manage`; services handling material commands also require/verify actor capability.
- Frontend visibility is not authorization.
- When a feature is entitlement-gated, backend permission and tenant entitlement must both pass. Payment-provider state is not read directly by operational modules.

## Request validation and errors

- Pydantic request models use `extra='forbid'`, bounded strings/lists, typed UUID/date/Decimal values, and normalized optional text.
- Cross-entity and lifecycle rules belong in services inside the transaction.
- Preserve FastAPI's structured `422` validation response. Use short user-safe `detail` strings for domain errors; production never returns tracebacks.
- Typical statuses: `200` read/update/command, `201` create, `401` unauthenticated/invalid session, `403` authenticated permission/entitlement denial, `404` absent or cross-tenant resource, `409` stale version/duplicate/current-state conflict, `422` invalid transition or business rule.

## Pagination

- Page-based collections preserve the V1 shape `{items, page, page_size, total, total_pages}` and cap `page_size` at 100.
- High-churn or partitioned streams may use cursor pagination with `{items, next_cursor}`. The cursor is opaque, stable, and includes deterministic tie-breaking (usually timestamp plus UUID).
- History/activity endpoints are always bounded and newest-first unless a timeline explicitly requests oldest-first.
- The production board uses bounded per-stage collections so one stage cannot starve the others; see the V2.1 specification.

## Search, filters, and sorting

- Search length is bounded (normally 200), trimmed, and applied only to documented fields.
- Filters are typed enums/dates/booleans. Unknown filters or enum values produce `422`; no arbitrary SQL-like filter syntax.
- Sort keys are allowlisted. Default ordering is documented and deterministic with UUID as the final tie-breaker when needed.
- Search/filter predicates remain tenant scoped and should match composite indexes for high-volume paths.

## Archive and delete semantics

- Mutable master records referenced by history use `archived_at`/restore where V1 already does (customers and measurement profiles) or a documented status.
- Archived records are excluded by default and addressed explicitly with an archive filter.
- Ledger/history records are not archived, edited, or deleted through normal APIs.
- Hard delete is reserved for explicit retention/legal workflows with ownership and audit; it is not a routine CRUD default.

## Commands and history

- Meaningful transitions use command-oriented endpoints when they need specialized authorization, validation, transaction, or activity: `/status`, `/stage`, `/archive`, `/restore`, `/notes`.
- The authoritative mutation and its append-only history record commit in the same transaction.
- Actor, tenant, and timestamps come from server context/clock, never request payloads.
- Normal response schemas may include current state but never unbounded history. History has a separate paginated endpoint.

## Idempotency

- Naturally idempotent target-state commands (archive, restore, set the already-current stage) return current state without duplicate history.
- Commands that create money, stock, communications, invitations, or external side effects should accept an idempotency key when retry/duplicate risk exists. Store it tenant scoped with request fingerprint and result; a reused key with a different request is `409`.
- Do not add idempotency infrastructure to read-only or low-risk commands without a concrete retry requirement.

## Optimistic concurrency

- Mutable collaborative records such as `ProductionWorkItem` carry an integer `version`.
- Mutation requests include `expected_version` (or a documented `If-Match` equivalent). The update predicate includes tenant, ID, and version; zero updated rows produce `409` with a safe stale-state message.
- Successful changes increment the version and return it. Clients refetch/reconcile rather than overwrite another user's move.
- PostgreSQL row locks remain preferable where invariants depend on current totals/counters/last owner/stock balances.

## Response design

- Return task-oriented projections, not ORM graphs. Do not expose password hashes, token digests, internal provider secrets, or unrestricted internal notes.
- Decimal values serialize as strings. Dates are ISO dates; instants are ISO 8601 UTC-aware strings and displayed in business timezone by the frontend.
- IDs are UUID strings. URLs exposed publicly are validated and limited to fields intended for clients.
- Customer portal responses use separate customer-safe schemas; internal authenticated schemas are never reused wholesale.

## Cache invalidation

Each frontend module owns query-key factories. Mutations update the exact detail cache when safe and invalidate affected lists/aggregates. V2.1 production mutations invalidate the work-item detail, affected board filters/stages, production activity, compatible order detail/list, and dashboard summaries that depend on derived order status. Workspace switching clears all tenant-owned Query data before fetching the next session.

## Database and transaction boundary

- Routes stay thin; services own authorization-sensitive domain behavior and commits/rollbacks.
- Commands that mutate related aggregates use one transaction. Never commit state and append its history separately.
- Use explicit async SQLAlchemy queries and eager loading/projections to avoid N+1 behavior.
- Financial, inventory, and counter concurrency is tested against PostgreSQL; SQLite unit tests do not prove locking semantics.
