# V2 role and permission matrix

Permissions are backend-enforced named actions. Frontend visibility and disabled controls improve usability but never authorize a request. The active `BusinessMembership` supplies the role; every permission check occurs after membership and tenant validation.

Legend: **Allow** is granted by the initial fixed role policy; **Deny** is rejected. V2 deliberately has no custom permission editor.

| Permission | OWNER | MANAGER | TAILOR | ACCOUNTANT |
| --- | --- | --- | --- | --- |
| `dashboard.read` | Allow | Allow | Allow | Allow |
| `customers.read` | Allow | Allow | Allow | Allow |
| `customers.write` | Allow | Allow | Deny | Deny |
| `customers.archive` | Allow | Allow | Deny | Deny |
| `measurements.read` | Allow | Allow | Allow | Allow |
| `measurements.write` | Allow | Allow | Allow | Deny |
| `measurements.archive` | Allow | Allow | Deny | Deny |
| `orders.read` | Allow | Allow | Allow | Allow |
| `orders.write` | Allow | Allow | Deny | Deny |
| `orders.lifecycle.manage` | Allow | Allow | Deny | Deny |
| `orders.pricing.manage` | Allow | Allow | Deny | Allow |
| `production.read` | Allow | Allow | Allow | Allow |
| `production.manage` | Allow | Allow | Allow | Deny |
| `production.notes.write` | Allow | Allow | Allow | Deny |
| `payments.read` | Allow | Allow | Deny | Allow |
| `payments.record` | Allow | Allow | Deny | Allow |
| `invoices.read` | Allow | Allow | Deny | Allow |
| `invoices.issue` | Allow | Allow | Deny | Allow |
| `inventory.read` | Allow | Allow | Allow | Allow |
| `inventory.consume` | Allow | Allow | Allow | Deny |
| `inventory.manage` | Allow | Allow | Deny | Deny |
| `communication.read` | Allow | Allow | Deny | Deny |
| `communication.send` | Allow | Allow | Deny | Deny |
| `communication.templates.manage` | Allow | Allow | Deny | Deny |
| `portal_access.manage` | Allow | Allow | Deny | Deny |
| `reporting.read` | Allow | Allow | Deny | Allow |
| `team.read` | Allow | Allow | Deny | Deny |
| `team.manage` | Allow | Deny | Deny | Deny |
| `business.settings.read` | Allow | Allow | Allow | Allow |
| `business.settings.manage` | Allow | Allow | Deny | Deny |
| `subscription.read` | Allow | Allow | Deny | Allow |
| `subscription.manage` | Allow | Deny | Deny | Deny |

## Role intent

### OWNER

An owner governs the tenant and may perform every operational action. Only owners manage team membership/roles and subscription state. Last-active-owner safeguards apply even to owners.

### MANAGER

A manager runs the business: CRM, measurements, orders, production, finance operations, inventory, communication, reports, and business settings. Managers may see the team and subscription summary but cannot alter membership/ownership or subscription commitments.

### TAILOR

A tailor receives the customer/measurement/order context needed to make garments, records measurements, moves production, writes internal production notes, and consumes allocated material. A tailor cannot change customer master data, commercial order terms/prices, lifecycle delivery/cancellation, finance, team, settings, or subscriptions.

### ACCOUNTANT

An accountant has read context for customers, measurements, orders, production, and inventory; may manage order pricing, record/read payments, issue/read invoices, and read reports. An accountant cannot change shop-floor work, customer master data, team, business settings, or subscription commitments.

## Enforcement conventions

1. Route dependencies resolve the active membership and business before checking a named permission.
2. Services accept an actor context and enforce permissions again for commands with material security/financial impact; tests call services/routes through the real dependency path.
3. Permission denial within the current tenant is `403`. A resource ID outside the tenant is still `404` before disclosing whether the caller's role could act on it.
4. Payload fields never grant roles, permissions, business ownership, or actor identity.
5. Changing role/status takes effect on the next request because membership is reloaded from PostgreSQL; token claims do not freeze permissions.
6. Role changes, invitation actions, suspensions/reactivations, and last-owner attempts are audited.
7. Entitlements and permissions are separate: a role may have `inventory.manage`, but the tenant must also be entitled to Inventory. Both backend checks must pass.

## Decisions to validate during product rollout

The initial matrix is a safe product default, not a custom-policy platform. Early-user research should specifically validate whether managers may manage non-owner team members and whether tailors should edit customer contact details. Until changed deliberately, the table above is authoritative.
