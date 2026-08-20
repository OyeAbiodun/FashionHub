from __future__ import annotations

from app.models.user import UserRole

AVAILABLE_PERMISSIONS = frozenset(
    {
        "customers:read",
        "customers:write",
        "measurements:read",
        "measurements:write",
        "orders:read",
        "orders:write",
        "invoices:read",
        "invoices:write",
        "reports:read",
        "tasks:read",
        "tasks:write",
        "team:read",
        "team:write",
        "business:settings",
    }
)

PRIVILEGED_TENANT_ROLES = frozenset({UserRole.OWNER, UserRole.BUSINESS_ADMIN})


def effective_permissions(user) -> set[str]:
    """Return the current tenant permissions without trusting browser state."""
    if user.role == UserRole.SUPER_ADMIN or user.role in PRIVILEGED_TENANT_ROLES:
        return set(AVAILABLE_PERMISSIONS)

    permissions = set(user.permissions or [])
    if user.custom_role is not None:
        permissions.update(user.custom_role.permissions or [])
    return permissions & AVAILABLE_PERMISSIONS
