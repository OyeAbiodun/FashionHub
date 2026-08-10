# ADR 0004: Prefer append-oriented domain history

Status: Accepted for V2 planning — 2026-08-10

## Context

V1 already benefits from OrderStatusHistory, immutable payment rows, measurement snapshots, and archive semantics. V2 introduces production moves/notes, membership changes, stock adjustments, communications, and subscriptions where silent overwrite would hinder support, accountability, and recovery.

## Decision

Meaningful domain actions append an understandable module-owned history/ledger record in the same transaction as current-state mutation. Production uses ProductionActivity; inventory uses StockMovement; membership, communication, and subscription use focused histories. Ordinary APIs do not edit/delete histories. V2 does not use event sourcing or a universal payload-dump audit table.

## Consequences

- Support and tenant actors can understand who changed what and when.
- History queries must be indexed, paginated, retention-aware, and excluded from list-card eager loading.
- Corrections use new/compensating entries; exceptional redaction needs a separately audited policy.
- Actor migration preserves stable User authorship and adds membership context prospectively.
