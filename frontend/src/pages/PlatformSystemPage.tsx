import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, Database, Play, RefreshCw, Server, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { fetchPlatformSystemStatus, runReadonlyDatabaseQuery } from "../api/admin";
import { getApiErrorMessage } from "../api/client";
import { Button, Card, InlineError, PageContainer, PageHeader, inputStyles, textareaStyles } from "../components/ui";

const exampleQueries = [
  ["Business totals", "SELECT COUNT(*) AS business_count, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_businesses FROM businesses"],
  ["Recent orders", "SELECT id, business_id, order_number, status, due_date, created_at FROM orders ORDER BY created_at DESC LIMIT 25"],
  ["Recent payment totals", "SELECT business_id, currency, status, COUNT(*) AS payment_count, SUM(amount) AS amount FROM payments GROUP BY business_id, currency, status ORDER BY business_id, status"],
] as const;

function formatBytes(value: number | null) {
  if (value === null) return "Not reported";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; amount >= 1024 && index < units.length; index += 1) { amount /= 1024; unit = units[index]; }
  return `${amount.toFixed(1)} ${unit}`;
}

export function PlatformSystemPage() {
  const [query, setQuery] = useState("SELECT COUNT(*) AS business_count FROM businesses");
  const statusQuery = useQuery({ queryKey: ["admin", "system-status"], queryFn: fetchPlatformSystemStatus, refetchInterval: 60_000 });
  const databaseQuery = useMutation({ mutationFn: () => runReadonlyDatabaseQuery(query), onSuccess: () => setQuery((current) => current) });

  return <PageContainer>
    <PageHeader eyebrow="Super Admin · Operations" title="System status" description="Review application, database, email and billing readiness. Database queries run read-only with a five-second limit and a 200-row maximum." actions={<Button variant="outline" disabled={statusQuery.isFetching} onClick={() => void statusQuery.refetch()}><RefreshCw className={`h-4 w-4 ${statusQuery.isFetching ? "animate-spin" : ""}`} />Refresh checks</Button>} />
    {statusQuery.isError ? <div className="mt-6"><InlineError message="System checks could not be loaded. The API or database may be unavailable." retry={() => void statusQuery.refetch()} /></div> : null}
    {statusQuery.data ? <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="API" value={statusQuery.data.api_status} detail={`${statusQuery.data.app_name} · ${statusQuery.data.environment}`} icon={Server} healthy={statusQuery.data.api_status === "HEALTHY"} />
        <Metric label="Database" value={statusQuery.data.database_status} detail={`${statusQuery.data.database_dialect} · ${statusQuery.data.database_name}`} icon={Database} healthy={statusQuery.data.database_status === "HEALTHY"} />
        <Metric label="Schema revision" value={statusQuery.data.migration_revision ?? "Unknown"} detail={`${statusQuery.data.database_table_count} application tables`} icon={Activity} healthy={Boolean(statusQuery.data.migration_revision)} />
        <Metric label="Database size" value={formatBytes(statusQuery.data.database_size_bytes)} detail={`Server ${statusQuery.data.database_server_version}`} icon={Database} healthy={statusQuery.data.database_status === "HEALTHY"} />
      </div>
      <Card className="mt-5 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="font-semibold">Service checks</h2><p className="mt-1 text-sm text-muted">A warning means setup or a delivery test is incomplete. It does not necessarily mean the API is down.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-stone-50 text-xs uppercase tracking-wide text-muted"><tr><th className="px-5 py-3">Component</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Details</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-border">{statusQuery.data.checks.map((item) => <tr key={item.component}><td className="px-5 py-4 font-medium text-ink">{item.component}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "HEALTHY" ? "bg-emerald-50 text-emerald-800" : item.status === "FAILED" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{item.status}</span></td><td className="max-w-xl px-5 py-4 text-muted">{item.detail}</td><td className="px-5 py-4 text-right">{item.action === "Platform Settings" ? <Link className="font-semibold text-primary underline" to="/admin?tab=settings">Configure</Link> : item.action === "Subscriptions" ? <Link className="font-semibold text-primary underline" to="/admin?tab=subscriptions">Configure</Link> : item.action === "Retry check" ? <button className="font-semibold text-primary underline" onClick={() => void statusQuery.refetch()}>Retry</button> : <span className="text-muted">—</span>}</td></tr>)}</tbody></table></div>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">Runtime and database</h2></div><dl className="mt-4 grid gap-3 sm:grid-cols-2">{[["Environment", statusQuery.data.environment], ["Debug", statusQuery.data.debug ? "Enabled" : "Disabled"], ["Secure cookies", statusQuery.data.cookie_secure ? "Enabled" : "Disabled"], ["Database host", statusQuery.data.database_host ?? "Local / embedded"], ["Database size", formatBytes(statusQuery.data.database_size_bytes)], ["Pool size", statusQuery.data.database_pool.size ?? "Not reported"], ["Connections in use", statusQuery.data.database_pool.checked_out ?? "Not reported"], ["Overflow", statusQuery.data.database_pool.overflow ?? "Not reported"]].map(([label, value]) => <div className="rounded-lg bg-stone-50 p-3" key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-ink">{value}</dd></div>)}</dl><p className="mt-4 text-xs leading-5 text-muted">Connection strings, access tokens, passwords, and provider secrets are never shown on this page.</p></Card>
        <Card className="p-5 sm:p-6"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /><h2 className="font-semibold">Read-only database query</h2></div><p className="mt-1 text-sm text-muted">SELECT statements only. Sensitive credential, password, invitation and subscription tables are blocked. Results are audited without saving the SQL text.</p><label className="mt-4 block text-sm font-medium text-ink">SQL query<textarea className={`${textareaStyles} mt-2 min-h-40 font-mono text-xs`} spellCheck={false} value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><select className={`${inputStyles} max-w-sm`} aria-label="Query examples" value="" onChange={(event) => { const selected = exampleQueries.find(([label]) => label === event.target.value); if (selected) setQuery(selected[1]); }}><option value="">Load an example query…</option>{exampleQueries.map(([label]) => <option key={label}>{label}</option>)}</select><Button disabled={databaseQuery.isPending || !query.trim()} onClick={() => databaseQuery.mutate()}><Play className="h-4 w-4" />{databaseQuery.isPending ? "Running query…" : "Run query"}</Button></div>{databaseQuery.isError ? <div className="mt-4"><InlineError message={getApiErrorMessage(databaseQuery.error)} /></div> : null}{databaseQuery.data ? <div className="mt-4"><p className="mb-2 text-xs text-muted">{databaseQuery.data.row_count} rows · {databaseQuery.data.elapsed_ms} ms{databaseQuery.data.truncated ? " · more rows were available; result was capped" : ""}</p><div className="max-h-[28rem] overflow-auto rounded-lg border border-border"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 bg-stone-100"><tr>{databaseQuery.data.columns.map((column) => <th className="whitespace-nowrap px-3 py-2 font-semibold" key={column}>{column}</th>)}</tr></thead><tbody className="divide-y divide-border">{databaseQuery.data.rows.map((row, index) => <tr key={index}>{databaseQuery.data.columns.map((column) => <td className="max-w-72 whitespace-pre-wrap break-all px-3 py-2 align-top" key={column}>{typeof row[column] === "object" ? JSON.stringify(row[column]) : String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table></div></div> : null}</Card>
      </div>
    </> : null}
  </PageContainer>;
}

function Metric({ label, value, detail, icon: Icon, healthy }: { label: string; value: string; detail: string; icon: typeof Server; healthy: boolean }) {
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-2 text-lg font-semibold text-ink">{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div><span className={`rounded-lg p-2 ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-900"}`}><Icon className="h-5 w-5" /></span></div></Card>;
}
