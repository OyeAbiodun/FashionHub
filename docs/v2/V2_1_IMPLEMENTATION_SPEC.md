# V2.1 implementation specification — Production Workspace

This is the implementation handoff for the next session. It is architecture only; no V2.1 code or migration exists at Session 0 completion.

## Goal and acceptance boundary

Deliver a tenant-safe `/production` workspace where each existing `OrderItem` batch can progress independently through production, with priority, an optional internal due-date override, immutable notes/activity, accessible desktop/mobile controls, and V1 order compatibility.

V2.1 is complete only when mixed-stage orders work end to end, all existing V1 behavior remains green, production history is atomic, and no membership/task/inventory feature is introduced.

## Backend entities

### ProductionWorkItem

| Field | Type/rule |
| --- | --- |
| `id` | UUID primary key. |
| `business_id` | Non-null FK Business, indexed; always actor-derived. |
| `order_item_id` | Non-null FK OrderItem, unique, indexed. |
| `stage` | `ProductionStage`, default `NOT_STARTED`. |
| `priority` | `ProductionPriority`, default `NORMAL`. |
| `due_date_override` | Nullable date; when set cannot be after parent `Order.due_date`. |
| `stage_started_at` | Non-null timezone-aware instant. |
| `version` | Integer, starts 1, check `version >= 1`. |
| `created_at`, `updated_at` | Existing timestamp convention. |

Do not copy `order_id`, customer, garment, measurement, price, balance, or assignee. They are derived or deferred. Add a one-to-one relationship to `OrderItem` without making legacy `OrderItem.status` authoritative.

### ProductionActivity

| Field | Type/rule |
| --- | --- |
| `id` | UUID primary key. |
| `business_id` | Non-null FK Business and tenant index prefix. |
| `production_work_item_id` | Non-null FK work item, indexed. |
| `event_type` | `CREATED`, `MIGRATED`, `STAGE_CHANGED`, `PRIORITY_CHANGED`, `DUE_DATE_CHANGED`, `NOTE_ADDED`. |
| `actor_user_id` | Nullable FK User; null only for migration/system event. |
| `previous_stage`, `new_stage` | Nullable stage pair, legal only for stage event. |
| `previous_priority`, `new_priority` | Nullable priority pair. |
| `previous_due_date`, `new_due_date` | Nullable date pair. |
| `note` | Nullable text; required/nonblank for `NOTE_ADDED`, optional reason elsewhere; max 5000. |
| `created_at` | Non-null timezone-aware timestamp. No `updated_at`. |

Service validation enforces event-specific column combinations. Ordinary APIs never update/delete activity.

### Enums

- `ProductionStage`: `NOT_STARTED`, `CUTTING`, `SEWING`, `FITTING`, `FINISHING`, `READY`.
- `ProductionPriority`: `LOW`, `NORMAL`, `HIGH`, `URGENT`.
- `ProductionActivityType`: values above.

## Migration requirements

1. Import new models into Alembic metadata.
2. Create enums, `production_work_items`, `production_activities`, constraints, and indexes.
3. Required indexes:
   - unique `production_work_items(order_item_id)`;
   - `(business_id, stage, due_date_override)`;
   - `(business_id, priority, stage)`;
   - `(business_id, production_work_item_id, created_at)` on activity.
4. Backfill one work item per existing order item by joining Orders for `business_id` and status context. Mapping is defined in `PRODUCTION_DOMAIN.md`.
5. Insert one `MIGRATED` activity per backfilled work item with null actor and deterministic text; do not fabricate timestamps/actions beyond migration time.
6. Verify before commit: `order_items count == production_work_items count`, no duplicate item links, every production business equals the parent order business, and enum mapping counts match the source report.
7. New order creation after migration must create its work items in the same transaction as Order/OrderItems and initial order history.
8. Migration downgrade may drop new tables/enums only with an explicit warning that V2 production history is lost. Do not attempt to reconstruct mixed item stages into one order status.

No migration is generated in Session 0.

## Transaction/orchestration change

Current V1 `create_order` commits internally. V2.1 should introduce an application-layer order-creation orchestrator that coordinates the Orders and Production services in one `AsyncSession` transaction:

1. validate tenant customer/measurement profiles and generate the order number;
2. construct and flush Order/OrderItems/initial OrderStatusHistory;
3. ask Production to create one work item per flushed item;
4. commit once; rollback all on any failure;
5. return the unchanged V1 order response plus production data only where the new contract explicitly adds it.

This composition layer may depend on both modules; Orders and Production must not import and mutate each other's private repositories. Similarly, a production stage command asks an Orders application service to persist the derived order summary in the same transaction.

## API endpoints

All endpoints derive tenant and actor from authentication. V2.1 uses existing users; permission hooks should be shaped for `production.read/manage/notes.write` but may temporarily map every active V1 user to the V1-compatible capability until V2.2 implements roles.

### `GET /api/v1/production/board`

Query:

- `search` optional, max 200;
- `stage` repeatable optional enum;
- `priority` repeatable optional enum;
- `due` optional: `overdue`, `today`, `next_7_days`, `with_override`;
- `limit_per_stage` default 25, max 50.

Returns one entry for each requested/default stage:

```json
{
  "columns": [
    {
      "stage": "SEWING",
      "items": [
        {
          "id": "uuid",
          "version": 3,
          "stage": "SEWING",
          "priority": "HIGH",
          "stage_started_at": "2026-08-10T14:00:00Z",
          "due_date_override": null,
          "effective_due_date": "2026-08-14",
          "is_overdue": false,
          "overdue_days": 0,
          "order_item": {
            "id": "uuid",
            "garment_type": "Agbada",
            "description": null,
            "quantity": 1
          },
          "order": {"id": "uuid", "order_number": "ORD-000123"},
          "customer": {"id": "uuid", "name": "Ada Okafor", "phone": "080..."}
        }
      ],
      "total": 18,
      "has_more": false
    }
  ],
  "applied_at": "2026-08-10T14:05:00Z"
}
```

Default scope excludes `DRAFT`, `DELIVERED`, and `CANCELLED` orders. Apply filters in SQL. Default card order: priority rank `URGENT`, `HIGH`, `NORMAL`, `LOW`; effective due date ascending; oldest `stage_started_at`; UUID tie-breaker.

### `GET /api/v1/production/work-items`

Flat page-based list for mobile stage views and “view all” from a busy column. Same filters plus `page/page_size` (max 100), normally one selected stage. Returns V1 pagination metadata.

### `GET /api/v1/production/work-items/{work_item_id}`

Returns the card projection plus full safe order-item context, current production fields, effective due calculation, and latest bounded activity preview. It must not embed measurement values, prices/balance, or unbounded history unless explicitly required by the screen and permissioned.

### `POST /api/v1/production/work-items/{work_item_id}/stage`

Payload: `{stage, expected_version, note?}`. Rules:

- tenant scoped and `production.manage`;
- active non-draft/nonterminal order;
- target allowed by transition graph;
- compare expected version, update stage/stage_started_at/version, append activity, recompute Order summary, commit atomically;
- same target returns current state without duplicate activity;
- stale different state returns `409`.

### `PATCH /api/v1/production/work-items/{work_item_id}`

Payload contains `expected_version` and at least one of `priority` or `due_date_override` (explicit null clears override). Each changed value appends its own typed activity; all changes share one atomic version increment. No-op returns current state without activity.

### `POST /api/v1/production/work-items/{work_item_id}/notes`

Payload `{note}` with nonblank max 5000. Requires `production.notes.write`. Appends `NOTE_ADDED`; it does not mutate the work-item version. Response `201` is the activity DTO.

### `GET /api/v1/production/work-items/{work_item_id}/activities`

Page-based, newest-first, max 100. Returns actor display name, event type, typed before/after fields, note, and created timestamp. Cross-tenant work item returns `404`.

## Service responsibilities

- `production_query_service`: board/list/detail projections, filters, effective date and overdue calculation, paginated activity; no commits.
- `production_command_service`: tenant lookup, transition/priority/due/note validation, optimistic concurrency, activity creation, order-summary orchestration; one commit boundary controlled by caller.
- `production_factory`: create work items/initial activity for new or migrated items without committing.
- `order_production_summary_service` in Orders: calculate/persist compatible intermediate `Order.status`, enforce delivery-ready precondition, and preserve terminal states.
- Routes translate HTTP/Pydantic data only; they do not contain transitions or SQL.

## Tenant rules

- Start every production lookup with `ProductionWorkItem.business_id == actor.business_id`.
- Join OrderItem -> Order and also require `Order.business_id == actor.business_id`; treat any inconsistent redundant tenant row as a server integrity error, not data to expose.
- Payloads contain no `business_id`, `order_id`, `order_item_id`, actor, customer, or history timestamps.
- Cross-tenant board cards never appear; cross-tenant ID reads/writes/history return `404`.
- New order production work items inherit the server-resolved order business only.

## Production-stage rules

Allowed graph:

- `NOT_STARTED -> CUTTING`
- `CUTTING -> SEWING`
- `SEWING -> FITTING | FINISHING`
- `FITTING -> SEWING | FINISHING`
- `FINISHING -> READY`
- `READY -> FINISHING`

No mutation on DRAFT, DELIVERED, or CANCELLED orders. Confirming a DRAFT exposes its existing NOT_STARTED items. Delivering requires every work item READY. Intermediate OrderStatus is recomputed from the least-advanced stage; all NOT_STARTED maps to CONFIRMED and all READY maps to READY. Order cancellation preserves last stages and hides work from active board.

The legacy order status endpoint becomes a compatibility bulk-stage command for CUTTING–READY and continues explicit DRAFT/CONFIRMED/DELIVERED/CANCELLED lifecycle rules. It cannot write only `Order.status`/`OrderItem.status` after V2.1.

## History rules

- Every actual stage, priority, or due override change creates exactly one corresponding activity in the same transaction.
- Notes are immutable activities. No activity update/delete route.
- Migration/system events are the only actor-null rows; otherwise actor user is required.
- Input notes never accept actor/time/event type.
- History is excluded from normal board queries and paginated separately.
- V2.2 adds nullable `actor_membership_id` and assignment activity columns without rewriting V2.1 rows.

## Priority rules

Default `NORMAL`. Priority lives only on ProductionWorkItem. Sorting/filtering uses a fixed explicit rank. Order UI may derive maximum item priority but cannot persist an Order priority. No task priority exists.

## Due-date rules

- Effective date is `COALESCE(due_date_override, Order.due_date)`.
- Override is a business-local date, must not exceed order due date, and may be cleared.
- Overdue excludes READY and terminal/draft orders and uses `business_today`.
- Changing `Order.due_date` automatically changes effective dates only for items without overrides and invalidates production queries. If a new earlier order date makes an override later than the order due date, the Order update must reject until overrides are cleared/adjusted transactionally.

## Search/filter behavior

- Search: order number, customer first/last name, normalized phone, garment type, description.
- Filters combine with AND; repeated stages/priorities use IN.
- Empty trimmed search behaves as absent.
- No arbitrary sort expression. Board ordering is fixed; flat list may later expose an allowlisted `sort` only with a validated need.
- Board and flat-list totals reflect the same filters.

## Frontend routes and state

- Add `/production` inside `ProtectedRoute`/`AppShell` only when implemented.
- Add one Production sidebar entry; do not add future Inventory/Communication/Reports/Team links.
- New typed API module, types, and hooks own `productionKeys` for board, lists, detail, and activity.
- URL search parameters should represent shareable filters/stage where practical; clamp invalid values to defaults.

## Desktop UX

- Six labeled columns with bounded cards and per-column counts/“view all”. Horizontal board scrolling is acceptable at desktop widths if column headings remain clear; the page itself must not cause accidental body overflow.
- Cards show garment/quantity, order, customer, effective due/overdue, priority, and stage age if useful.
- Clicking a card opens/navigates to detail. A labeled action opens the stage dialog.
- Drag-and-drop is optional enhancement only and calls the same mutation; do not implement it unless keyboard/touch behavior and tests fit the session.
- Filters: search, due, priority, stage. Clear-all and filter-specific empty state required.

## Mobile UX

- Stage tabs/select plus one vertical paginated list; no six-column squeeze.
- Filters in a labeled dismissible dialog/sheet.
- Each card has visible View and Change stage controls with 44px touch targets.
- After mutation, preserve stage/filter context and focus; announce success/conflict.

## Accessibility

- Semantic headings for page/columns, labeled inputs/buttons, text labels alongside colors/icons.
- Fully keyboard-operable card/action/dialog flow; Escape closes dialog and restores focus.
- Focus-visible styling uses shared primitives.
- Async mutation outcome uses accessible notice/live region; stale `409` explains that data changed and offers refetch.
- Loading skeleton has a label; error includes retry; empty states distinguish no data/no matches/empty stage.

## Cache invalidation

After stage/priority/due mutation:

- set returned work-item detail;
- invalidate all production boards/lists (a card can change column/filter eligibility/order);
- invalidate its activity list;
- invalidate owning Order detail/list/customer-order lists;
- invalidate dashboard summary/due/recent/alerts because derived OrderStatus/due relevance may change.

After note: invalidate activity and detail preview only. After Order due-date/status changes: invalidate production board/lists/details for the order. Workspace switching in V2.2 clears all tenant data.

## Backend tests

- Enum/transition graph including FITTING/READY rework and rejected skips.
- One work item per new item; quantity batch semantics; full rollback on production creation failure.
- Mixed-stage order aggregation and delivery blocked until all ready.
- Terminal/draft mutation rejection and cancelled stage preservation.
- Stage/priority/due/no-op/note activity shape, actor, timestamp, and atomic rollback.
- Due override validation, clearing, effective date, timezone-aware overdue calculation.
- Search/filter/order/per-stage limit/pagination and no unbounded activity.
- Cross-tenant read/mutation/activity all `404`; payload tenant/actor/system-field injection `422`.
- Permission hook coverage compatible with V2.2 named permissions.
- Query-count regression or SQL inspection proving no per-card relationship/activity/payment queries.
- Existing V1 order-status endpoint compatibility and all V1 tests unchanged.

## PostgreSQL tests

- Migration base/head and backfill counts/mapping/unique constraints on production-like data.
- Concurrent stage updates with same version: one succeeds, one receives `409`, one history row.
- Concurrent moves on two items recompute the same order summary correctly under order-row locking.
- New order/work-item transaction and rollback.
- Cross-tenant production access with real PostgreSQL.
- Index presence; use a representative `EXPLAIN` sanity check without encoding brittle cost values.
- Continue the database identity guard: `TEST_DATABASE_URL` and `current_database() == 'fashionos_test'` before cleanup.

## Frontend tests

- Production route is protected and navigation marks it active.
- Board loading/error/no-data/no-match/empty-column states.
- Search/due/priority/stage filters and URL state.
- Card content, mixed order stages, overdue and priority text (not color only).
- Stage dialog allowed options, success move, error, stale `409` refetch/recovery.
- Priority/due update and immutable note addition.
- Mobile stage list/filter dialog/change-stage flow with keyboard assertions.
- Cache invalidation affects production, order, and dashboard keys.
- No inaccessible drag-only behavior.

## Manual QA scenarios

1. Create one order with Agbada, Trouser, and Cap as separate items; confirm three NOT_STARTED cards.
2. Move them to SEWING, FINISHING, and READY; confirm independent columns and derived order summary SEWING.
3. Exercise FITTING -> SEWING and READY -> FINISHING rework with history.
4. Set URGENT and an earlier due override; verify ordering/filters and business-local overdue boundary.
5. Add internal note; verify activity attribution and absence from invoice/print/customer-facing data.
6. Attempt a stale concurrent move in two browser sessions; verify conflict and preserved winner.
7. Attempt another tenant's work-item UUID for detail, stage, patch, note, and history; verify `404`.
8. Verify delivery is blocked until every item is READY, then deliver; cards leave active board while history remains.
9. Verify cancelled order leaves board and preserves last item stages.
10. Check desktop, 375px mobile, touch, keyboard-only, focus restoration, screen-reader labels, no horizontal body overflow.
11. Refresh `/production` and filtered URLs through the production SPA host.

## Explicit non-goals

- BusinessMembership/team/invitations/roles implementation or any assignee field.
- ProductionTask/checklists, custom stages, templates, capacity/time tracking.
- Inventory/materials, communication/reminders, portal, reports, plans/entitlements.
- Customer-visible production notes or automatic messages.
- AI estimates, WhatsApp integration, drag-only UX.
- Changing pricing/payment/invoice authority or redesigning V1 screens.
