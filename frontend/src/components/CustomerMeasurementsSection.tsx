import { ArrowRight, Plus, Ruler } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Card,
  EmptyState,
  InlineError,
  LoadingBlock,
  SectionHeader,
  StatusBadge,
  buttonStyles,
} from "./ui";
import { useCustomerMeasurements } from "../hooks/useMeasurements";
import { formatDate } from "../lib/date";

export function CustomerMeasurementsSection({
  customerId,
}: {
  customerId: string;
}) {
  const [archived, setArchived] = useState(false);
  const query = useCustomerMeasurements(customerId, {
    page: 1,
    page_size: 10,
    archived,
  });
  const items = query.data?.items ?? [];

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        title="Measurement Vault"
        description="Sizing profiles and measurement history for this customer."
        action={
          <Link
            className={buttonStyles({ size: "sm" })}
            to={`/customers/${customerId}/measurements/new`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Measurement
          </Link>
        }
      />
      <label className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
        <input
          className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
          type="checkbox"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
        />
        Show archived measurements
      </label>

      <div className="mt-5">
        {query.isLoading ? <LoadingBlock label="Loading measurements" /> : null}
        {query.isError ? (
          <InlineError
            message="Could not load measurements."
            retry={() => void query.refetch()}
          />
        ) : null}
        {!query.isLoading && !query.isError && items.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="No measurements saved yet."
            description="Add a profile to keep this customer’s sizing history in one reliable place."
            compact
          />
        ) : null}
        {items.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((profile) => (
              <Link
                key={profile.id}
                className="group rounded-xl border border-border p-4 transition hover:border-primary/35 hover:bg-primary-soft/20"
                to={`/measurement-profiles/${profile.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Ruler className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {profile.archived_at ? (
                    <StatusBadge status="ARCHIVED" label="Archived" />
                  ) : (
                    <ArrowRight
                      className="h-4 w-4 text-stone-300 group-hover:text-primary"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <h3 className="mt-4 font-semibold text-ink group-hover:text-primary">
                  {profile.name}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {profile.garment_type}
                  {profile.template_name ? ` · ${profile.template_name}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {profile.value_count} measurements · {profile.unit}
                  </span>
                  <span>{formatDate(profile.recorded_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
