import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Power,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  createCustomRole,
  deleteCustomRole,
  fetchRoles,
  type RoleItem,
} from "../api/roles";
import {
  addStaffMember,
  fetchTeamMembers,
  updateStaffMember,
} from "../api/team";
import { getApiErrorMessage } from "../api/client";
import {
  Button,
  Card,
  Dialog,
  InlineError,
  MetricCard,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SuccessNotice,
  buttonStyles,
  errorTextStyles,
  inputStyles,
  labelStyles,
  selectStyles,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";

const ALL_PERMISSIONS = [
  { key: "customers:read", label: "View Customers" },
  { key: "customers:write", label: "Create & Edit Customers" },
  { key: "measurements:read", label: "View Measurements" },
  { key: "measurements:write", label: "Create & Edit Measurements" },
  { key: "orders:read", label: "View Orders" },
  { key: "orders:write", label: "Create & Manage Orders" },
  { key: "tasks:read", label: "View Tasks" },
  { key: "tasks:write", label: "Assign & Manage Tasks" },
  { key: "invoices:read", label: "View Invoices & Payments" },
  { key: "invoices:write", label: "Generate Invoices & Payments" },
  { key: "reports:read", label: "View Financial Reports" },
];

const staffSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().email("Enter a valid email address"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["BUSINESS_ADMIN", "STAFF"]),
});

type StaffFormValues = z.infer<typeof staffSchema>;

export function TeamPage() {
  const queryClient = useQueryClient();
  const { business, user: currentUser } = useAuth();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);

  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<string[]>([
    "customers:read",
    "orders:read",
    "tasks:read",
  ]);

  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([
    "customers:read",
    "orders:read",
    "measurements:read",
    "tasks:read",
  ]);

  const [formApiError, setFormApiError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);
  const [roleApiError, setRoleApiError] = useState("");
  const [roleSuccess, setRoleSuccess] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: fetchTeamMembers,
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: fetchRoles,
  });

  const staffForm = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      password: "",
      role: "STAFF",
    },
  });

  const addStaffMutation = useMutation({
    mutationFn: addStaffMember,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team"] });
      setFormSuccess(true);
      setTimeout(() => {
        setAddModalOpen(false);
        setFormSuccess(false);
        staffForm.reset();
      }, 1000);
    },
    onError: (err) => {
      setFormApiError(getApiErrorMessage(err));
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (data: { id: string; isActive: boolean }) =>
      updateStaffMember(data.id, { is_active: data.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: createCustomRole,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      setRoleSuccess(true);
      setNewRoleName("");
      setNewRoleDesc("");
      setTimeout(() => {
        setRoleSuccess(false);
      }, 1500);
    },
    onError: (err) => {
      setRoleApiError(getApiErrorMessage(err));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: deleteCustomRole,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });

  const teamMembers = teamQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const customRoles = roles.filter((r) => !r.is_system_role);

  const activeCount = teamMembers.filter((m) => m.is_active).length;
  const maxAllowed = business?.max_staff_users ?? 10;
  const isLimitReached = teamMembers.length >= maxAllowed;

  function onAddSubmit(values: StaffFormValues) {
    setFormApiError("");
    setFormSuccess(false);
    addStaffMutation.mutate({
      ...values,
      phone: values.phone?.trim() || null,
      permissions: values.role === "STAFF" ? selectedPermissions : null,
    });
  }

  function handleCreateRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim()) {
      setRoleApiError("Role name is required");
      return;
    }
    setRoleApiError("");
    setRoleSuccess(false);
    createRoleMutation.mutate({
      name: newRoleName.trim(),
      description: newRoleDesc.trim() || null,
      permissions: newRolePerms,
    });
  }

  function applyPresetRole(role: RoleItem) {
    setSelectedPermissions(role.permissions ?? []);
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Organization"
        title="Team & Dynamic Role Management"
        description="Invite staff members, assign dynamic roles (Master Cutter, Senior Tailor, Sales), and manage granular permission presets."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setRoleModalOpen(true);
                setRoleApiError("");
                setRoleSuccess(false);
              }}
            >
              <Shield className="h-4 w-4" />
              Manage Custom Roles
            </Button>
            <Button
              type="button"
              disabled={isLimitReached}
              onClick={() => {
                setAddModalOpen(true);
                setFormApiError("");
                setFormSuccess(false);
                staffForm.reset();
              }}
            >
              <UserPlus className="h-4 w-4" />
              Add Staff Member
            </Button>
          </div>
        }
      />

      {/* Metrics Header */}
      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total Team Members"
          value={teamMembers.length.toString()}
          subtext={`${activeCount} active accounts`}
          icon={Users}
        />
        <MetricCard
          label="Staff Account Limit"
          value={`${teamMembers.length} / ${maxAllowed}`}
          subtext={isLimitReached ? "Limit reached (Upgrade required)" : "Accounts available"}
          icon={isLimitReached ? ShieldAlert : UserCheck}
        />
        <MetricCard
          label="Dynamic Roles Configured"
          value={customRoles.length.toString()}
          subtext="Custom workspace roles"
          icon={ShieldCheck}
        />
      </div>

      {/* Dynamic Roles Cards Summary */}
      {customRoles.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Custom Workspace Roles
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customRoles.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border p-4 bg-white shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink text-sm">{r.name}</span>
                    <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {r.permissions.length} perms
                    </span>
                  </div>
                  {r.description ? (
                    <p className="text-xs text-muted mt-1">{r.description}</p>
                  ) : null}
                </div>
                <div className="mt-3 pt-2 border-t border-border flex flex-wrap gap-1">
                  {r.permissions.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded"
                    >
                      {p}
                    </span>
                  ))}
                  {r.permissions.length > 3 ? (
                    <span className="text-[10px] text-muted">+{r.permissions.length - 3} more</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Staff Directory */}
      <div className="mt-8">
        <Card className="p-5 sm:p-7">
          <SectionHeader
            title="Team Members Directory"
            description="Manage account access, roles, and status for everyone in your fashion studio."
          />

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Member Name</th>
                  <th className="px-4 py-3">Email & Contact</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assigned Permissions</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3.5 font-semibold text-ink">
                      {member.first_name} {member.last_name}
                      {member.id === currentUser?.id ? (
                        <span className="ml-2 text-xs font-normal text-muted">(You)</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-ink">{member.email}</div>
                      <div className="text-xs text-muted">{member.phone || "No phone"}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge
                        status="ACTIVE"
                        label={
                          member.role === "BUSINESS_ADMIN" || member.role === "OWNER"
                            ? "Business Admin"
                            : "Staff Member"
                        }
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      {member.role === "BUSINESS_ADMIN" || member.role === "OWNER" ? (
                        <span className="text-xs text-emerald-700 font-medium">
                          Full Business Access
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(member.permissions || []).map((perm) => (
                            <span
                              key={perm}
                              className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-200"
                            >
                              {perm}
                            </span>
                          ))}
                          {!member.permissions || member.permissions.length === 0 ? (
                            <span className="text-xs text-muted">No specific permissions</span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge
                        status={member.is_active ? "ACTIVE" : "CANCELLED"}
                        label={member.is_active ? "Active" : "Disabled"}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {member.id !== currentUser?.id ? (
                        <button
                          className={buttonStyles({
                            variant: "outline",
                            size: "sm",
                            className: member.is_active
                              ? "h-8 px-2.5 text-xs text-red-700 hover:bg-red-50 border-red-200"
                              : "h-8 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 border-emerald-200",
                          })}
                          type="button"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: member.id,
                              isActive: !member.is_active,
                            })
                          }
                        >
                          <Power className="h-3.5 w-3.5 mr-1" />
                          {member.is_active ? "Disable" : "Enable"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">Current Session</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Add Staff Modal */}
      {addModalOpen ? (
        <Dialog title="Add Staff Member" onClose={() => setAddModalOpen(false)}>
          <form className="space-y-4" onSubmit={staffForm.handleSubmit(onAddSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelStyles}>First Name</span>
                <input className={inputStyles} {...staffForm.register("first_name")} />
                {staffForm.formState.errors.first_name ? (
                  <span className={errorTextStyles}>
                    {staffForm.formState.errors.first_name.message}
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className={labelStyles}>Last Name</span>
                <input className={inputStyles} {...staffForm.register("last_name")} />
                {staffForm.formState.errors.last_name ? (
                  <span className={errorTextStyles}>
                    {staffForm.formState.errors.last_name.message}
                  </span>
                ) : null}
              </label>
            </div>

            <label className="block">
              <span className={labelStyles}>Email Address</span>
              <input className={inputStyles} type="email" {...staffForm.register("email")} />
              {staffForm.formState.errors.email ? (
                <span className={errorTextStyles}>{staffForm.formState.errors.email.message}</span>
              ) : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={labelStyles}>Phone Number (optional)</span>
                <input className={inputStyles} {...staffForm.register("phone")} />
              </label>

              <label className="block">
                <span className={labelStyles}>Temporary Password</span>
                <input
                  className={inputStyles}
                  type="password"
                  {...staffForm.register("password")}
                />
                {staffForm.formState.errors.password ? (
                  <span className={errorTextStyles}>
                    {staffForm.formState.errors.password.message}
                  </span>
                ) : null}
              </label>
            </div>

            <label className="block">
              <span className={labelStyles}>Account Role</span>
              <select className={selectStyles} {...staffForm.register("role")}>
                <option value="STAFF">Staff / Tailor (Granular Permissions)</option>
                <option value="BUSINESS_ADMIN">Business Admin (Full Workspace Access)</option>
              </select>
            </label>

            {staffForm.watch("role") === "STAFF" ? (
              <div>
                {customRoles.length > 0 ? (
                  <div className="mb-3">
                    <label className={labelStyles}>Apply Custom Role Preset (optional)</label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {customRoles.map((cr) => (
                        <button
                          key={cr.id}
                          type="button"
                          className="rounded bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-xs font-medium text-ink transition-colors"
                          onClick={() => applyPresetRole(cr)}
                        >
                          Use "{cr.name}" Permissions
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className={labelStyles}>Staff Feature Permissions</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
                  {ALL_PERMISSIONS.map((p) => {
                    const checked = selectedPermissions.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs font-medium text-ink hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPermissions((prev) => [...prev, p.key]);
                            } else {
                              setSelectedPermissions((prev) => prev.filter((k) => k !== p.key));
                            }
                          }}
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {formApiError ? <InlineError message={formApiError} /> : null}
            {formSuccess ? <SuccessNotice>Staff member added successfully.</SuccessNotice> : null}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button variant="outline" type="button" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={staffForm.formState.isSubmitting}>
                {staffForm.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Add Staff Member
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {/* Dynamic Custom Role Management Modal */}
      {roleModalOpen ? (
        <Dialog title="Dynamic Custom Role Management" onClose={() => setRoleModalOpen(false)}>
          <div className="space-y-6">
            {/* Create Custom Role Form */}
            <form className="space-y-4 rounded-xl border border-border p-4 bg-slate-50/60" onSubmit={handleCreateRoleSubmit}>
              <h4 className="font-semibold text-sm text-ink flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Create New Custom Role
              </h4>

              <div>
                <label className={labelStyles} htmlFor="new-role-name">
                  Role Name
                </label>
                <input
                  id="new-role-name"
                  className={inputStyles}
                  placeholder="e.g. Master Pattern Cutter, Front Desk Rep"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
              </div>

              <div>
                <label className={labelStyles} htmlFor="new-role-desc">
                  Role Description (optional)
                </label>
                <input
                  id="new-role-desc"
                  className={inputStyles}
                  placeholder="e.g. Responsible for cutting fabric patterns and customer fitting"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                />
              </div>

              <div>
                <label className={labelStyles}>Allowed Permission Set</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 max-h-40 overflow-y-auto pr-1">
                  {ALL_PERMISSIONS.map((p) => {
                    const checked = newRolePerms.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="flex items-center gap-2 rounded border border-border bg-white p-2 text-xs font-medium text-ink hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewRolePerms((prev) => [...prev, p.key]);
                            } else {
                              setNewRolePerms((prev) => prev.filter((k) => k !== p.key));
                            }
                          }}
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {roleApiError ? <InlineError message={roleApiError} /> : null}
              {roleSuccess ? <SuccessNotice>Custom role created successfully.</SuccessNotice> : null}

              <div className="flex justify-end pt-2">
                <Button type="submit" size="sm" disabled={createRoleMutation.isPending}>
                  {createRoleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Save Custom Role
                </Button>
              </div>
            </form>

            {/* List of Custom Roles */}
            <div>
              <h4 className="font-semibold text-sm text-ink mb-3">Configured Custom Roles</h4>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {customRoles.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 bg-white"
                  >
                    <div>
                      <p className="font-semibold text-sm text-ink">{r.name}</p>
                      {r.description ? (
                        <p className="text-xs text-muted">{r.description}</p>
                      ) : null}
                      <p className="text-[11px] text-emerald-700 font-medium mt-1">
                        {r.permissions.length} permissions assigned
                      </p>
                    </div>

                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      type="button"
                      title="Delete role"
                      disabled={deleteRoleMutation.isPending}
                      onClick={() => deleteRoleMutation.mutate(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {customRoles.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">
                    No custom roles created yet. Use the form above to add dynamic roles for your studio.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border">
              <Button variant="outline" type="button" onClick={() => setRoleModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </PageContainer>
  );
}
