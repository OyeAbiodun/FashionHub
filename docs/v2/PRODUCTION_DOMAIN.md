# V2.1 production domain

## Core decisions

### What is an Order?

An `Order` is the customer-level commercial and fulfillment aggregate: customer, order number, dates, price/discount, invoice/payments, cancellation, and delivery. It can summarize production but is not the authoritative shop-floor unit when it contains multiple garments.

### What is an OrderItem?

An `OrderItem` is an ordered garment line. It carries garment description, quantity, price, measurement reference, style reference, notes, and position. Because V1 permits `quantity > 1`, one line can represent a batch of identical garments. V2.1 treats that line as one production unit whose quantity moves together. If otherwise-identical garments must progress independently, they must be separate order items; automatic splitting is not a V2.1 feature.

### What constitutes a garment being produced?

The production unit is a one-to-one `ProductionWorkItem` for an `OrderItem`. A card represents the work item plus projected order/customer/garment context. It never represents the entire order.

### Where does production state belong?

Production state belongs to `ProductionWorkItem`, not `Order.status` and not the legacy nullable `OrderItem.status`. A separate one-to-one model gives Production an explicit module boundary and direct `business_id`, while leaving order pricing and item identity stable.

Conceptual fields:

| Field | Reason |
| --- | --- |
| `id` | Stable UUID addressed by production APIs. |
| `business_id` | Direct, mandatory tenant predicate and board index prefix. |
| `order_item_id` | Unique foreign key to the garment line; order/customer are derivable. |
| `stage` | Authoritative item-level `ProductionStage`. |
| `priority` | One operational priority; default `NORMAL`. |
| `due_date_override` | Nullable exception to the parent order due date. |
| `stage_started_at` | Supports age-in-stage without scanning all history. |
| `version` | Integer optimistic-concurrency token for board edits. |
| `created_at`, `updated_at` | Operational timestamps. |

`order_id`, customer fields, garment description, price, balance, and assignment are intentionally not copied. Assignment arrives as `assigned_membership_id` in V2.2.

## Production stages

V2.1 introduces a production-only vocabulary:

`NOT_STARTED`, `CUTTING`, `SEWING`, `FITTING`, `FINISHING`, `READY`.

`DRAFT`, `CONFIRMED`, `DELIVERED`, and `CANCELLED` are order lifecycle states, not garment-production stages. Delivery/cancellation remain explicit order commands and are not duplicated as production stages.

Allowed stage moves initially preserve the proven V1 workflow and its rework paths:

```text
NOT_STARTED -> CUTTING -> SEWING -> FITTING -> FINISHING -> READY
                              \--------------> FINISHING
FITTING -> SEWING
READY -> FINISHING
```

Every move is validated server-side and writes history in the same transaction. Arbitrary skips are rejected. Product research may later justify configurable stages, but custom workflows are not a V2.1 assumption.

## Relationship to OrderStatus

The recommendation is **C: item-level production stages are authoritative, while the intermediate order status is a derived compatibility summary**.

- `DRAFT` and initial `CONFIRMED` remain explicit order intake states.
- `CUTTING` through `READY` on `Order.status` summarize the least-advanced active garment (the production bottleneck). If any work item is `NOT_STARTED`, the summary is `CONFIRMED`; if all are `READY`, it is `READY`.
- `DELIVERED` and `CANCELLED` remain explicit, terminal commercial/fulfillment commands and are never overwritten by production aggregation.
- Delivery requires all production work items to be `READY`.
- Cancelling an order stops further production mutations but preserves each work item's last stage and history.
- The existing order status endpoint can remain temporarily as a compatibility bulk action for intermediate stages. It must validate and move every affected work item transactionally, append one activity per work item, and then recompute the order summary. New UI uses production endpoints.
- The legacy `OrderItem.status` column is not a second source of truth. V2.1 either keeps it synchronized during compatibility or deprecates it after all readers move; removal is a later, separately reviewed migration.

For mixed items:

```text
ORD-000123 (derived order summary: SEWING)
  Agbada   SEWING
  Trouser  FINISHING
  Cap      READY
```

The order summary is useful for V1 lists, but the production board is the operational truth.

## Migration/backfill design

Session 0 creates no migration. V2.1 should add the production enum/table/activity table, then backfill exactly one work item per existing order item in an idempotent data step:

| V1 item/order status | Initial production stage |
| --- | --- |
| `CUTTING` | `CUTTING` |
| `SEWING` | `SEWING` |
| `FITTING` | `FITTING` |
| `FINISHING` | `FINISHING` |
| `READY` or `DELIVERED` | `READY` |
| null, `DRAFT`, or `CONFIRMED` | `NOT_STARTED` |
| `CANCELLED` | Map the cancellation history's previous stage when it is `CUTTING`–`READY`; otherwise `NOT_STARTED`. |

Use `OrderItem.status` when populated and fall back to `Order.status`. Existing delivered/cancelled orders are excluded from the active board. Insert a `MIGRATED` activity containing no fabricated user action; it may have a nullable system actor and a fixed migration description. Review counts before and after, and require unique `order_item_id`.

Rollback may remove the new production tables only while V1 status compatibility is still maintained. Once V2-only stage changes exist, downgrade would discard history and must require an explicit backup/operational decision.

## Production tasks

V2.1 does **not** create `ProductionTask`. Stage, priority, date exception, notes, and activity are sufficient for the first real workroom board. A task hierarchy would add task types, statuses, ordering, assignment, due dates, templates, and completion rules before user behavior validates them.

If later validated, `ProductionTask` belongs under `ProductionWorkItem`, not directly under Order. Minimal future fields would be `id`, `business_id`, `production_work_item_id`, `title`, `status` (`TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED`), optional due date, optional `assigned_membership_id`, timestamps, and version. Its task status would remain distinct from the garment stage. No placeholder table or API is added in V2.1.

## Priority

`ProductionPriority` is `LOW`, `NORMAL`, `HIGH`, or `URGENT` and belongs only to `ProductionWorkItem`. An order-level priority would be ambiguous for mixed garments, and no task exists yet. Order screens may derive their highest displayed priority from their work items, but must not persist a duplicate order priority.

Priority changes require `production.manage`, optimistic version matching, and an activity row containing old/new priority and actor.

## Due dates and overdue work

The order due date remains the promised customer delivery date. `due_date_override` is nullable and means “this garment needs to be production-ready by this earlier or specifically adjusted business date.” It is not silently copied from the order.

`effective_due_date = COALESCE(production_work_item.due_date_override, order.due_date)`.

A work item is overdue when:

- its order is neither `DELIVERED` nor `CANCELLED`;
- its stage is not `READY`; and
- `effective_due_date < business_today(business)`.

The override may not be after the order due date in V2.1; changing the customer promise remains an Order command. No task due date exists until tasks exist.

## Internal production notes

Notes are immutable `NOTE_ADDED` production activity entries. They are tenant scoped, timestamped, attributed to the current user, and never copied into order notes, invoices, communications, or future portal responses. Normal APIs cannot edit/delete a note. A correction is another note; exceptional redaction requires an administrative retention procedure and audit.

When memberships arrive, new activities also capture `actor_membership_id`; historical `actor_user_id` remains valid. This preserves who acted while adding the workspace/role context in V2.2.

## Production activity

`ProductionActivity` is an append-only, domain-specific history—not event sourcing and not a generic audit bus.

Conceptual fields:

- `id`, `business_id`, `production_work_item_id`;
- `event_type`: `CREATED`, `MIGRATED`, `STAGE_CHANGED`, `PRIORITY_CHANGED`, `DUE_DATE_CHANGED`, `NOTE_ADDED` (later `ASSIGNMENT_CHANGED`);
- `actor_user_id` nullable only for a defined system/migration event;
- typed nullable before/after columns for stage, priority, and due date;
- `note` for the actor's reason or immutable internal note;
- `created_at` only—no `updated_at`.

The service validates which fields are legal for each event type. Stage, priority, due-date changes, and note creation write the work-item mutation and activity in one transaction. Assignment history is added with V2.2.

## Future staff assignment

V2.1 does not expose assignment and does not add a user-based assignee column. V2.2 adds nullable `ProductionWorkItem.assigned_membership_id -> BusinessMembership.id` and validates that the membership is active and belongs to the work item's business. Suspending/removing a member does not erase history; open assignments are explicitly reassigned or cleared under a documented service rule.

Actor identity in V2.1 may reference `User`; that is historical authorship, not assignment. V2.2 augments new activity with membership context instead of rewriting old actors.

## Production board

Route: `/production`.

Each card represents one `ProductionWorkItem`/`OrderItem` batch and shows garment type/quantity, order number, customer name, effective due date/overdue state, priority, and stage. Price and balance are omitted from the first board because they are not required to move work and would add financial joins/permissions.

Desktop columns: Not started, Cutting, Sewing, Fitting, Finishing, Ready. Controls:

- search order number, customer name/phone, garment type/description;
- due filter: overdue, today, next 7 days, no override/all;
- priority and stage filters;
- click/keyboard-open a detail panel;
- stage change through a labeled button/dialog/select;
- optional pointer drag-and-drop only if it invokes the same validated command and has an equally visible keyboard/button alternative.

Accessibility requirements:

- columns are headings and cards are focusable links/actions in logical DOM order;
- stage/priority are text plus semantic badges, never color alone;
- moves announce success/failure through an accessible live region and restore focus;
- no required hover-only controls; dialogs are labeled, focus-managed, and Escape-dismissible.

Empty states distinguish no production yet, no filter matches, and a single empty stage. Loading/error states reuse V1 shared primitives.

## Mobile production UX

Mobile uses a stage selector/tabs plus a vertical card list, not a horizontally squeezed six-column board. Filters open in an accessible sheet/dialog. Every card exposes a clear `Change stage` action:

```text
Agbada · ORD-000123
Ada Okafor
Stage: Sewing
Due: Tomorrow · High priority

[View] [Change stage]
```

Drag-and-drop is never required. The same dialog works with touch, keyboard, and screen readers. Lists remain bounded and load more explicitly.

## API shape and bounded querying

The board response groups bounded items by stage so one busy column cannot consume a global page:

```json
{
  "columns": [
    {
      "stage": "SEWING",
      "items": [],
      "total": 18,
      "next_cursor": null
    }
  ],
  "applied_at": "2026-08-10T12:00:00Z"
}
```

Default active-board limits are 25 cards per stage and a hard maximum of 50. Filters and search run in PostgreSQL. The query selects a projection from production work item -> order item -> order -> customer, with the effective due-date expression; it never loads full payments, invoice, measurement values, or activity per card. Detail and paginated activity are separate calls.

Candidate endpoints are specified in `V2_1_IMPLEMENTATION_SPEC.md`. All resource lookups combine `business_id` with resource ID and return `404` cross-tenant. Mutations require the expected `version` and return `409` on stale edits.

## Explicit V2.1 non-goals

- Team membership, invitation, assignment, shifts, time sheets, or payroll.
- Granular tasks/checklists or custom production stages.
- Inventory allocation/consumption.
- Customer portal or customer-visible production notes.
- Automated communication/reminders.
- Production analytics, capacity planning, AI estimates, or workflow automation.
- Redesigning order pricing, invoices, or the V1 order-number format.
