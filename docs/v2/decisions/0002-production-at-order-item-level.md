# ADR 0002: Track production at OrderItem level

Status: Accepted for V2.1 planning — 2026-08-10

## Context

V1 stores one authoritative OrderStatus and copies it to every OrderItem. An order with several garments therefore cannot show Sewing, Finishing, and Ready simultaneously. OrderStatus also controls delivery/cancellation and financial locking, so replacing it outright would break V1 semantics.

## Decision

Create one tenant-owned `ProductionWorkItem` per `OrderItem`. Its production stage, priority, due-date override, version, and activity are authoritative for shop-floor work. Intermediate `Order.status` remains a derived compatibility summary; Draft/Confirmed intake and Delivered/Cancelled lifecycle remain explicit. A quantity greater than one is one batch; independently moving garments require separate order items.

## Consequences

- The production board accurately represents mixed-stage orders without copying commercial/CRM data.
- Backfill and synchronous creation for every existing/new OrderItem are required.
- Order summary synchronization and legacy status endpoint compatibility need careful transactional tests.
- Granular ProductionTask and assignment models remain optional later extensions rather than V2.1 prerequisites.
