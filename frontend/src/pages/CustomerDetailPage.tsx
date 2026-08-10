import {
  Archive,
  ArrowLeft,
  Edit3,
  Plus,
  RotateCcw,
  Ruler,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { CustomerMeasurementsSection } from "../components/CustomerMeasurementsSection";
import { CustomerOrdersSection } from "../components/CustomerOrdersSection";
import { CustomerPaymentsSection } from "../components/CustomerPaymentsSection";
import {
  AvatarInitials,
  Button,
  Card,
  Dialog,
  InlineError,
  PageContainer,
  Skeleton,
  StatusBadge,
  SuccessNotice,
  buttonStyles,
} from "../components/ui";
import {
  useArchiveCustomer,
  useCustomer,
  useRestoreCustomer,
} from "../hooks/useCustomers";
import { formatDate } from "../lib/date";

export function CustomerDetailPage() {
  const { customerId } = useParams();
  const location = useLocation();
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const customerQuery = useCustomer(customerId);
  const archiveMutation = useArchiveCustomer(customerId ?? "");
  const restoreMutation = useRestoreCustomer(customerId ?? "");
  const message = (location.state as { message?: string } | null)?.message;

  if (customerQuery.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-40" />
        <Skeleton className="mt-6 h-64" />
      </PageContainer>
    );
  }
  if (customerQuery.isError || !customerQuery.data) {
    return (
      <PageContainer>
        <InlineError message="Customer not found." />
      </PageContainer>
    );
  }

  const customer = customerQuery.data;
  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ");

  async function archive() {
    await archiveMutation.mutateAsync();
    setShowArchiveDialog(false);
  }

  return (
    <PageContainer>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to="/customers"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to customers
      </Link>
      {message ? (
        <div className="mt-5">
          <SuccessNotice>{message}</SuccessNotice>
        </div>
      ) : null}

      <header className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AvatarInitials name={fullName} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {fullName}
              </h1>
              {customer.archived_at ? (
                <StatusBadge status="ARCHIVED" label="Archived" />
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted">
              {customer.phone}
              {customer.email ? ` · ${customer.email}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className={buttonStyles({ variant: "outline" })}
            to={`/customers/${customer.id}/edit`}
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" /> Edit
          </Link>
          {customer.archived_at ? (
            <Button
              onClick={() => void restoreMutation.mutateAsync()}
              disabled={restoreMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setShowArchiveDialog(true)}>
              <Archive className="h-4 w-4" aria-hidden="true" /> Archive
            </Button>
          )}
        </div>
      </header>

      {!customer.archived_at ? (
        <div className="mt-6 flex flex-wrap gap-3 rounded-xl border border-primary/15 bg-primary-soft/60 p-4">
          <p className="mr-auto self-center text-sm font-medium text-primary">
            Quick actions
          </p>
          <Link
            className={buttonStyles({ size: "sm" })}
            to={`/orders/new?customerId=${customer.id}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> New Order
          </Link>
          <Link
            className={buttonStyles({ variant: "outline", size: "sm" })}
            to={`/customers/${customer.id}/measurements/new`}
          >
            <Ruler className="h-4 w-4" aria-hidden="true" /> Add Measurement
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-ink">Client details</h2>
          <dl className="mt-5 space-y-4">
            <Detail label="Phone" value={customer.phone} />
            <Detail label="Alternate phone" value={customer.alternate_phone} />
            <Detail label="Email" value={customer.email} />
            <Detail label="Gender" value={customer.gender} />
            <Detail
              label="Birthday"
              value={customer.birthday ? formatDate(customer.birthday) : null}
            />
            <Detail label="Address" value={customer.address} />
            <Detail
              label="Customer since"
              value={formatDate(customer.created_at)}
            />
            <Detail label="Notes" value={customer.notes} />
          </dl>
        </Card>
        <div className="min-w-0 space-y-6">
          <CustomerMeasurementsSection customerId={customer.id} />
          <CustomerOrdersSection customerId={customer.id} />
          <CustomerPaymentsSection customerId={customer.id} />
        </div>
      </div>

      <Dialog
        open={showArchiveDialog}
        title="Archive this customer?"
        description="They will be removed from the active customer list, while measurements, orders, and payment history remain preserved."
        onClose={() => setShowArchiveDialog(false)}
        danger
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowArchiveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={() => void archive()}
              disabled={archiveMutation.isPending}
            >
              Archive Customer
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
        {value}
      </dd>
    </div>
  );
}
