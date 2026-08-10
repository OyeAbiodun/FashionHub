import { ArrowRight, Plus, Ruler, Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AvatarInitials,
  Button,
  Card,
  Dialog,
  EmptyState,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
  StatusBadge,
  buttonStyles,
  inputStyles,
} from "../components/ui";
import { useCustomers } from "../hooks/useCustomers";
import { useMeasurementProfiles } from "../hooks/useMeasurements";
import { formatDate } from "../lib/date";
import type { GlobalMeasurementProfileListItem } from "../types/measurement";

export function MeasurementsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [garmentInput, setGarmentInput] = useState("");
  const [search, setSearch] = useState("");
  const [garmentType, setGarmentType] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const query = useMeasurementProfiles({
    search: search || undefined,
    garment_type: garmentType || undefined,
    archived,
    page,
    page_size: 10,
  });

  useEffect(() => setPage(1), [search, garmentType, archived]);

  function submitFilters(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setGarmentType(garmentInput.trim());
  }

  function clearFilters() {
    setSearchInput("");
    setGarmentInput("");
    setSearch("");
    setGarmentType("");
    setArchived(false);
  }

  const items = query.data?.items ?? [];
  const filtered = Boolean(search || garmentType || archived);
  const settledEmpty = !query.isLoading && !query.isError && items.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Measurement Vault"
        description="Manage customer sizing profiles and measurement history."
        actions={
          <Button type="button" onClick={() => setSelectorOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Measurement
          </Button>
        }
      />

      <Card className="mt-7 p-4 sm:p-5">
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.4fr)_auto_auto] md:items-end"
          onSubmit={submitFilters}
        >
          <label className="min-w-0">
            <span className="sr-only">Search measurements</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                className={`${inputStyles} mt-0 pl-10`}
                placeholder="Search customer, phone, profile, or garment…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </span>
          </label>
          <label>
            <span className="sr-only">Garment type</span>
            <input
              className={`${inputStyles} mt-0`}
              placeholder="Garment type"
              value={garmentInput}
              onChange={(event) => setGarmentInput(event.target.value)}
            />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-ink">
            <input
              className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
              type="checkbox"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
            />
            Archived
          </label>
          <Button variant="outline" type="submit">
            Apply filters
          </Button>
        </form>
        {filtered ? (
          <button
            className="mt-3 text-sm font-semibold text-primary hover:underline"
            type="button"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </Card>

      {query.isLoading ? (
        <div className="mt-6 space-y-3" aria-label="Loading measurements">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : null}
      {query.isError ? (
        <div className="mt-6">
          <InlineError
            message="We couldn’t load your measurement profiles."
            retry={() => void query.refetch()}
          />
        </div>
      ) : null}
      {settledEmpty ? (
        <Card className={`mt-6 ${filtered ? "" : "border-dashed"}`}>
          <EmptyState
            icon={filtered ? Search : Ruler}
            title={
              filtered
                ? "No measurements match your filters."
                : "No measurements saved yet"
            }
            description={
              filtered
                ? "Try a different search or clear the active filters."
                : "Add a customer measurement profile to start building your sizing history."
            }
            action={
              filtered ? (
                <Button variant="outline" type="button" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button type="button" onClick={() => setSelectorOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add
                  Measurement
                </Button>
              )
            }
          />
        </Card>
      ) : null}

      {items.length > 0 ? (
        <Card className="mt-6 overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-stone-50/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Profile</th>
                  <th className="px-5 py-3 font-semibold">Garment</th>
                  <th className="px-5 py-3 font-semibold">Measurements</th>
                  <th className="px-5 py-3 font-semibold">Recorded</th>
                  <th className="px-5 py-3 font-semibold">Unit</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((profile) => (
                  <MeasurementTableRow
                    key={profile.profile_id}
                    profile={profile}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border md:hidden">
            {items.map((profile) => (
              <MeasurementMobileCard
                key={profile.profile_id}
                profile={profile}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {query.data && query.data.total_pages > 1 ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted">
            Page {query.data.page} of {query.data.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={page >= query.data.total_pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      <CustomerSelectorDialog
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
      />
    </PageContainer>
  );
}

function MeasurementTableRow({
  profile,
}: {
  profile: GlobalMeasurementProfileListItem;
}) {
  return (
    <tr className="group hover:bg-stone-50/70">
      <td className="px-5 py-4">
        <Link
          className="flex items-center gap-3"
          to={`/customers/${profile.customer_id}`}
        >
          <AvatarInitials name={profile.customer_name} />
          <span>
            <span className="block font-semibold text-ink group-hover:text-primary">
              {profile.customer_name}
            </span>
            <span className="mt-0.5 block text-muted">
              {profile.customer_phone}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{profile.profile_name}</span>
          {profile.archived_at ? (
            <StatusBadge status="ARCHIVED" label="Archived" />
          ) : null}
        </div>
        {profile.template_name ? (
          <p className="mt-1 text-xs text-muted">
            {profile.template_name} template
          </p>
        ) : null}
      </td>
      <td className="px-5 py-4 text-ink">{profile.garment_type}</td>
      <td className="px-5 py-4 text-ink">{profile.value_count} measurements</td>
      <td className="px-5 py-4 text-muted">
        {formatDate(profile.recorded_at)}
        {profile.recorded_by_name ? (
          <span className="mt-1 block text-xs">
            by {profile.recorded_by_name}
          </span>
        ) : null}
      </td>
      <td className="px-5 py-4 font-medium text-ink">{profile.unit}</td>
      <td className="px-5 py-4 text-right">
        <Link
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          to={`/measurement-profiles/${profile.profile_id}`}
        >
          View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function MeasurementMobileCard({
  profile,
}: {
  profile: GlobalMeasurementProfileListItem;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start gap-3">
        <Link
          to={`/customers/${profile.customer_id}`}
          aria-label={`View ${profile.customer_name}`}
        >
          <AvatarInitials name={profile.customer_name} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                className="truncate font-semibold text-ink hover:text-primary"
                to={`/customers/${profile.customer_id}`}
              >
                {profile.customer_name}
              </Link>
              <p className="mt-0.5 text-sm text-muted">
                {profile.customer_phone}
              </p>
            </div>
            {profile.archived_at ? (
              <StatusBadge status="ARCHIVED" label="Archived" />
            ) : null}
          </div>
          <h2 className="mt-4 font-semibold text-ink">
            {profile.profile_name}
          </h2>
          <p className="mt-1 text-sm text-muted">{profile.garment_type}</p>
          <p className="mt-3 text-sm text-muted">
            {profile.value_count} measurements • {profile.unit}
          </p>
          <p className="mt-1 text-sm text-muted">
            Recorded {formatDate(profile.recorded_at)}
          </p>
          <Link
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            to={`/measurement-profiles/${profile.profile_id}`}
          >
            View Profile{" "}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function CustomerSelectorDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const customers = useCustomers(
    { search: search || undefined, archived: false, page: 1, page_size: 8 },
    open,
  );
  const items = customers.data?.items ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  function choose(customerId: string) {
    onClose();
    navigate(`/customers/${customerId}/measurements/new`);
  }

  return (
    <Dialog
      open={open}
      title="Select a customer"
      description="Choose who this measurement profile belongs to."
      onClose={onClose}
    >
      <form className="flex gap-2" onSubmit={submit}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search customers by name or phone</span>
          <input
            className={`${inputStyles} mt-0`}
            placeholder="Search name or phone…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <Button variant="outline" type="submit">
          Search
        </Button>
      </form>
      {customers.isLoading ? (
        <div className="mt-4 space-y-2" aria-label="Loading customers">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : null}
      {customers.isError ? (
        <div className="mt-4">
          <InlineError
            message="We couldn’t load your customers."
            retry={() => void customers.refetch()}
          />
        </div>
      ) : null}
      {!customers.isLoading && !customers.isError && items.length === 0 ? (
        <EmptyState
          icon={search ? Search : Ruler}
          compact
          title={search ? "No customers match your search" : "No customers yet"}
          description={
            search
              ? "Try a different customer name or phone number."
              : "Add a customer before recording measurements."
          }
          action={
            search ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
              >
                Clear search
              </Button>
            ) : (
              <Link
                className={buttonStyles()}
                to="/customers/new"
                onClick={onClose}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Customer
              </Link>
            )
          }
        />
      ) : null}
      {items.length > 0 ? (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border">
          {items.map((customer) => {
            const name = [customer.first_name, customer.last_name]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={customer.id}
                className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-stone-50"
                type="button"
                onClick={() => choose(customer.id)}
              >
                <AvatarInitials name={name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {name}
                  </span>
                  <span className="block text-sm text-muted">
                    {customer.phone}
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 text-primary"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </Dialog>
  );
}
