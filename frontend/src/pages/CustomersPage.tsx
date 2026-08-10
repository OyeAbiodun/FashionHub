import { ArrowRight, Plus, Search, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  AvatarInitials,
  Card,
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
import { formatDate } from "../lib/date";
import type { CustomerListItem } from "../types/customer";

export function CustomersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const query = useCustomers({
    search: search || undefined,
    page,
    page_size: 10,
    archived,
  });

  useEffect(() => setPage(1), [search, archived]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  const items = query.data?.items ?? [];
  const isSearchEmpty =
    Boolean(search) && !query.isLoading && !query.isError && items.length === 0;
  const isEmpty =
    !search &&
    !archived &&
    !query.isLoading &&
    !query.isError &&
    items.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Manage client records, measurements, and order history."
        actions={
          <Link className={buttonStyles()} to="/customers/new">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Customer
          </Link>
        }
      />

      <Card className="mt-7 p-4 sm:p-5">
        <form
          className="flex flex-col gap-3 md:flex-row md:items-end"
          onSubmit={submitSearch}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search by name or phone</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                className={`${inputStyles} mt-0 pl-10`}
                placeholder="Search customers by name or phone…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </span>
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
          <button
            className={buttonStyles({
              variant: "outline",
              className: "md:min-w-24",
            })}
            type="submit"
          >
            Search
          </button>
        </form>
      </Card>

      {query.isLoading ? (
        <div className="mt-6 space-y-3" aria-label="Loading customers">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : null}
      {query.isError ? (
        <div className="mt-6">
          <InlineError
            message="We couldn’t load your customers."
            retry={() => void query.refetch()}
          />
        </div>
      ) : null}
      {isEmpty ? (
        <Card className="mt-6 border-dashed">
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Add your first customer to start building a client list and storing measurements."
            action={
              <Link className={buttonStyles()} to="/customers/new">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Customer
              </Link>
            }
          />
        </Card>
      ) : null}
      {isSearchEmpty ? (
        <Card className="mt-6">
          <EmptyState
            icon={Search}
            title="No matching customers"
            description="Try a different name or phone number, or clear the archived filter."
            compact
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
                  <th className="px-5 py-3 font-semibold">Contact</th>
                  <th className="px-5 py-3 font-semibold">Added</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((customer) => (
                  <CustomerTableRow customer={customer} key={customer.id} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border md:hidden">
            {items.map((customer) => (
              <CustomerMobileCard customer={customer} key={customer.id} />
            ))}
          </div>
        </Card>
      ) : null}

      {query.data && query.data.total_pages > 1 ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            className={buttonStyles({ variant: "outline", size: "sm" })}
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-muted">
            Page {query.data.page} of {query.data.total_pages}
          </span>
          <button
            className={buttonStyles({ variant: "outline", size: "sm" })}
            type="button"
            disabled={page >= query.data.total_pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </PageContainer>
  );
}

function customerName(customer: CustomerListItem) {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ");
}

function CustomerTableRow({ customer }: { customer: CustomerListItem }) {
  const name = customerName(customer);
  return (
    <tr className="group hover:bg-stone-50/70">
      <td className="px-5 py-4">
        <Link
          className="flex items-center gap-3"
          to={`/customers/${customer.id}`}
        >
          <AvatarInitials name={name} />
          <span className="font-semibold text-ink group-hover:text-primary">
            {name}
          </span>
        </Link>
      </td>
      <td className="px-5 py-4">
        <p className="font-medium text-ink">{customer.phone}</p>
        <p className="mt-0.5 text-muted">{customer.email || "No email"}</p>
      </td>
      <td className="px-5 py-4 text-muted">
        {formatDate(customer.created_at)}
      </td>
      <td className="px-5 py-4">
        <StatusBadge
          status={customer.archived_at ? "ARCHIVED" : "READY"}
          label={customer.archived_at ? "Archived" : "Active"}
        />
      </td>
      <td className="px-5 py-4 text-right">
        <Link
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          to={`/customers/${customer.id}`}
        >
          View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function CustomerMobileCard({ customer }: { customer: CustomerListItem }) {
  const name = customerName(customer);
  return (
    <Link
      className="flex items-start gap-3 p-4"
      to={`/customers/${customer.id}`}
    >
      <AvatarInitials name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{name}</p>
            <p className="mt-0.5 text-sm text-muted">{customer.phone}</p>
          </div>
          <StatusBadge
            status={customer.archived_at ? "ARCHIVED" : "READY"}
            label={customer.archived_at ? "Archived" : "Active"}
          />
        </div>
        {customer.email ? (
          <p className="mt-2 truncate text-sm text-muted">{customer.email}</p>
        ) : null}
      </div>
    </Link>
  );
}
