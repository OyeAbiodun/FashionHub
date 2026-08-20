import { ArrowRight, ArrowRightLeft, Plus, Ruler } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  Button,
  Card,
  Dialog,
  EmptyState,
  InlineError,
  LoadingBlock,
  SectionHeader,
  StatusBadge,
  buttonStyles,
} from "./ui";
import { useCustomerMeasurements, useMeasurementProfile } from "../hooks/useMeasurements";
import { formatDate } from "../lib/date";
import type { MeasurementValue } from "../types/measurement";

export function CustomerMeasurementsSection({
  customerId,
}: {
  customerId: string;
}) {
  const [archived, setArchived] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareProfileIdA, setCompareProfileIdA] = useState<string>("");
  const [compareProfileIdB, setCompareProfileIdB] = useState<string>("");

  const query = useCustomerMeasurements(customerId, {
    page: 1,
    page_size: 20,
    archived,
  });
  const items = query.data?.items ?? [];

  const detailA = useMeasurementProfile(compareProfileIdA || undefined);
  const detailB = useMeasurementProfile(compareProfileIdB || undefined);

  const profileA = detailA.data;
  const profileB = detailB.data;

  function openComparison() {
    if (items.length >= 2) {
      setCompareProfileIdA(items[0].id);
      setCompareProfileIdB(items[1].id);
    } else if (items.length === 1) {
      setCompareProfileIdA(items[0].id);
      setCompareProfileIdB(items[0].id);
    }
    setCompareModalOpen(true);
  }

  return (
    <Card className="p-5 sm:p-6">
      <SectionHeader
        title="Measurement Vault"
        description="Sizing profiles and measurement history comparison for this customer."
        action={
          <div className="flex flex-wrap gap-2">
            {items.length >= 1 ? (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={openComparison}
              >
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Compare Sizing
              </Button>
            ) : null}
            <Link
              className={buttonStyles({ size: "sm" })}
              to={`/customers/${customerId}/measurements/new`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add Measurement
            </Link>
          </div>
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

      {/* Side-by-Side Sizing Comparison Modal */}
      {compareModalOpen ? (
        <Dialog title="Side-by-Side Sizing Evolution" onClose={() => setCompareModalOpen(false)}>
          <div className="space-y-5">
            <p className="text-xs text-muted">
              Compare customer measurement changes between recorded sizing sessions.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Base Profile A
                </label>
                <select
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm text-ink"
                  value={compareProfileIdA}
                  onChange={(e) => setCompareProfileIdA(e.target.value)}
                >
                  {items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatDate(p.recorded_at)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Comparison Profile B
                </label>
                <select
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm text-ink"
                  value={compareProfileIdB}
                  onChange={(e) => setCompareProfileIdB(e.target.value)}
                >
                  {items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatDate(p.recorded_at)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comparison Matrix Table */}
            {detailA.isLoading || detailB.isLoading ? (
              <LoadingBlock label="Loading sizing profiles for comparison" />
            ) : profileA ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-slate-50 font-semibold text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5">Measurement Field</th>
                      <th className="px-3 py-2.5 text-right">{profileA.name} ({profileA.unit})</th>
                      {profileB ? (
                        <th className="px-3 py-2.5 text-right">{profileB.name} ({profileB.unit})</th>
                      ) : null}
                      {profileB && profileA.id !== profileB.id ? (
                        <th className="px-3 py-2.5 text-right">Difference (B - A)</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {(profileA.values ?? []).map((valA: MeasurementValue) => {
                      const valB = profileB?.values?.find((v: MeasurementValue) => v.field_key === valA.field_key);
                      const numA = parseFloat(valA.value);
                      const numB = valB ? parseFloat(valB.value) : NaN;
                      const diff = !isNaN(numA) && !isNaN(numB) ? numB - numA : null;

                      return (
                        <tr key={valA.id}>
                          <td className="px-3 py-2 font-medium text-ink">{valA.field_name}</td>
                          <td className="px-3 py-2 text-right font-mono text-ink">
                            {valA.value} {profileA.unit}
                          </td>
                          {profileB ? (
                            <td className="px-3 py-2 text-right font-mono text-ink">
                              {valB ? `${valB.value} ${profileB.unit}` : "-"}
                            </td>
                          ) : null}
                          {profileB && profileA.id !== profileB.id ? (
                            <td className="px-3 py-2 text-right font-mono font-semibold">
                              {diff !== null ? (
                                <span className={diff > 0 ? "text-emerald-700" : diff < 0 ? "text-amber-700" : "text-slate-400"}>
                                  {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} {profileA.unit}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-border">
              <Button variant="outline" onClick={() => setCompareModalOpen(false)}>
                Close Comparison
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}
