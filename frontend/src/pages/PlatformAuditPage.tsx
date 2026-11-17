import { useQuery } from "@tanstack/react-query";

import { fetchAdminAudit } from "../api/admin";
import { Card, InlineError, PageContainer, PageHeader, Skeleton } from "../components/ui";

export function PlatformAuditPage() {
  const query = useQuery({ queryKey: ["admin", "audit", "page"], queryFn: () => fetchAdminAudit({ limit: 100 }) });
  return <PageContainer><PageHeader title="Platform Audit Log" description="Super Admin actions across the FashionOS platform." /><Card className="mt-6 divide-y divide-border p-5">{query.isLoading ? <Skeleton className="h-32" /> : null}{query.isError ? <InlineError message="Could not load platform audit history." /> : null}{query.data?.map((entry) => <article className="py-3 first:pt-0 last:pb-0" key={entry.id}><h2 className="text-sm font-semibold">{entry.summary}</h2><p className="mt-1 text-xs text-muted">{entry.actor_name} ({entry.actor_email}) · {entry.business_name ?? "Platform"} · {new Date(entry.timestamp).toLocaleString()}{entry.source_ip ? ` · IP ${entry.source_ip}` : ""}{entry.user_agent ? ` · ${entry.user_agent}` : ""}</p><p className="mt-1 text-xs text-muted">{entry.action}</p>{Object.keys(entry.details).length ? <pre className="mt-2 overflow-auto rounded bg-stone-50 p-2 text-xs">{JSON.stringify(entry.details, null, 2)}</pre> : null}</article>)}{query.data?.length === 0 ? <p className="text-sm text-muted">No platform audit events recorded.</p> : null}</Card></PageContainer>;
}
