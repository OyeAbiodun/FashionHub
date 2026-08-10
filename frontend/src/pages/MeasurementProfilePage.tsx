import { Archive, ArrowLeft, Ruler, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Button,
  Card,
  Dialog,
  InlineError,
  PageContainer,
  Skeleton,
  StatusBadge,
} from "../components/ui";
import {
  useArchiveMeasurementProfile,
  useMeasurementProfile,
  useRestoreMeasurementProfile,
} from "../hooks/useMeasurements";
import { formatDate } from "../lib/date";

export function MeasurementProfilePage() {
  const { profileId } = useParams();
  const profileQuery = useMeasurementProfile(profileId);
  const profile = profileQuery.data;
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const archiveMutation = useArchiveMeasurementProfile(
    profileId ?? "",
    profile?.customer_id,
  );
  const restoreMutation = useRestoreMeasurementProfile(
    profileId ?? "",
    profile?.customer_id,
  );

  if (profileQuery.isLoading) {
    return (
      <PageContainer className="max-w-6xl">
        <Skeleton className="h-36" />
        <Skeleton className="mt-6 h-80" />
      </PageContainer>
    );
  }
  if (profileQuery.isError || !profile) {
    return (
      <PageContainer className="max-w-6xl">
        <InlineError message="Measurement profile not found." />
      </PageContainer>
    );
  }

  async function archive() {
    await archiveMutation.mutateAsync();
    setShowArchiveDialog(false);
  }

  const unit = profile.unit === "INCH" ? "in" : "cm";
  return (
    <PageContainer className="max-w-6xl">
      <nav
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
        aria-label="Breadcrumb"
      >
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          to="/measurements"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Measurement Vault
        </Link>
        <Link
          className="text-sm font-semibold text-primary hover:underline"
          to={`/customers/${profile.customer_id}`}
        >
          Customer profile
        </Link>
      </nav>
      <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Ruler className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {profile.name}
              </h1>
              {profile.archived_at ? (
                <StatusBadge status="ARCHIVED" label="Archived" />
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted">
              {profile.garment_type} · {profile.unit} · Recorded{" "}
              {formatDate(profile.recorded_at)} by {profile.recorded_by_name}
            </p>
          </div>
        </div>
        {profile.archived_at ? (
          <Button
            onClick={() => void restoreMutation.mutateAsync()}
            disabled={restoreMutation.isPending}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setShowArchiveDialog(true)}>
            <Archive className="h-4 w-4" aria-hidden="true" /> Archive
          </Button>
        )}
      </header>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Measurements</h2>
            <p className="mt-1 text-sm text-muted">
              Organized values from the selected garment template.
            </p>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {profile.values.map((value) => (
              <div
                key={value.id}
                className="rounded-xl border border-border bg-stone-50/60 p-4"
              >
                <dt className="text-sm text-muted">{value.field_name}</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                  {value.value}
                  <span className="ml-1 text-sm font-medium text-muted">
                    {unit}
                  </span>
                </dd>
                {value.notes ? (
                  <p className="mt-2 text-xs text-muted">{value.notes}</p>
                ) : null}
              </div>
            ))}
          </dl>
        </Card>
        <aside className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold text-ink">Profile details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Detail
                label="Template"
                value={profile.template_name ?? "Custom profile"}
              />
              <Detail label="Garment" value={profile.garment_type} />
              <Detail
                label="Unit"
                value={profile.unit === "INCH" ? "Inches" : "Centimeters"}
              />
              <Detail
                label="Recorded"
                value={formatDate(profile.recorded_at)}
              />
            </dl>
          </Card>
          {profile.notes ? (
            <Card className="p-5">
              <h2 className="font-semibold text-ink">Notes</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                {profile.notes}
              </p>
            </Card>
          ) : null}
        </aside>
      </div>

      <Dialog
        open={showArchiveDialog}
        title="Archive this measurement profile?"
        description="The measurement history will be preserved, but this profile will be hidden from active measurement selections."
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
              Archive Measurement
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-ink">{value}</dd>
    </div>
  );
}
