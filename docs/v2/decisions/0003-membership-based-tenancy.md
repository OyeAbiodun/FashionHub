# ADR 0003: Move tenancy to BusinessMembership

Status: Accepted for V2.2 planning — 2026-08-10

## Context

V1 embeds one `business_id` and `OWNER/STAFF` role on User. This prevents multi-business access and makes identity, workspace, and authorization one concern. V2 needs explicit team roles and future production assignment without breaking existing users.

## Decision

Introduce `BusinessMembership(user_id, business_id, role, status)` and use an active membership as the server-validated workspace/permission context. Migrate additively, keep `User.business_id/role` during compatibility, then remove them in a later migration. Workspace switching accepts a membership selector, verifies it belongs to the current user, and rotates signed HTTP-only cookies. Production assignment will reference membership, never `User.business_id`.

## Consequences

- One identity can securely join multiple businesses with different roles.
- Authentication dependencies, session responses, frontend caches, and every protected API must transition together.
- Last-owner and invitation races require PostgreSQL locking/constraints and audit.
- Legacy STAFF rows require reviewed mapping; blanket OWNER backfill is unsafe.
