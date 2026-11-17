import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileBarChart, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchBusinessReports } from "../api/reports";
import { Button, Card, InlineError, PageContainer, PageHeader, Skeleton } from "../components/ui";
import { formatMoney } from "../lib/money";
import { useAuth } from "../hooks/useAuth";
import type { BusinessReports, ReportStatusCount, ReportTrendPoint } from "../types/reports";

const statusColors = ["#28765b", "#3b82a0", "#8b5cf6", "#d58a2b", "#de6c49", "#54a477", "#64748b", "#b94b4b", "#64748b"];

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialRange() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  return { start: toDateInput(start), end: toDateInput(today) };
}

function axisNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return Math.round(value).toLocaleString("en-NG");
}

function monthLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 1));
}

function RevenueChart({ points, currency }: { points: ReportTrendPoint[]; currency: string }) {
  const values = points.map((point) => Number(point.collected_revenue));
  const max = Math.max(1, ...values);
  const left = 54;
  const top = 18;
  const width = 700;
  const height = 205;
  const coords = values.map((value, index) => ({
    x: left + (points.length < 2 ? width / 2 : (index / (points.length - 1)) * width),
    y: top + height - (value / max) * height,
  }));
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = coords.length ? `${path} L${coords[coords.length - 1].x},${top + height} L${coords[0].x},${top + height} Z` : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return points.length === 0 ? <p className="py-14 text-center text-sm text-muted">No collection activity in this period.</p> : <div>
    <div className="flex items-baseline justify-between gap-2"><p className="text-xs text-muted">Successful payments received · {currency}</p><span className="text-xs text-muted">Monthly totals</span></div>
    <div className="mt-4 overflow-x-auto">
      <svg className="h-64 min-w-[620px] w-full" viewBox="0 0 790 280" role="img" aria-label="Monthly collected revenue trend">
        {ticks.map((tick) => {
          const y = top + height - tick * height;
          return <g key={tick}><line x1={left} y1={y} x2={left + width} y2={y} stroke="#e6ece8" strokeDasharray={tick === 0 ? undefined : "4 5"} /><text x={left - 9} y={y + 4} textAnchor="end" fill="#708078" fontSize="11">{axisNumber(max * tick)}</text></g>;
        })}
        {areaPath ? <path d={areaPath} fill="#28765b" fillOpacity="0.10" /> : null}
        {path ? <path d={path} fill="none" stroke="#28765b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {coords.map((point, index) => <g key={points[index].period}><circle cx={point.x} cy={point.y} r="4" fill="white" stroke="#28765b" strokeWidth="2.5"><title>{points[index].period}: {formatMoney(points[index].collected_revenue, currency)}</title></circle><text x={point.x} y={top + height + 23} textAnchor="middle" fill="#708078" fontSize="11">{monthLabel(points[index].period)}</text></g>)}
      </svg>
    </div>
  </div>;
}

function OrdersChart({ points }: { points: ReportTrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.order_count));
  return points.length === 0 ? <p className="py-14 text-center text-sm text-muted">No orders in this period.</p> : <div>
    <p className="text-xs text-muted">Non-cancelled orders by order date</p>
    <div className="mt-4 overflow-x-auto">
      <svg className="h-64 min-w-[520px] w-full" viewBox="0 0 790 280" role="img" aria-label="Monthly order volume">
        {[0, 0.5, 1].map((tick) => { const y = 18 + 205 - tick * 205; return <g key={tick}><line x1="46" y1={y} x2="770" y2={y} stroke="#e6ece8" strokeDasharray={tick === 0 ? undefined : "4 5"} /><text x="37" y={y + 4} textAnchor="end" fill="#708078" fontSize="11">{Math.round(max * tick)}</text></g>; })}
        {points.map((point, index) => { const slot = 700 / points.length; const barWidth = Math.min(38, slot * 0.56); const h = (point.order_count / max) * 205; const x = 54 + index * slot + (slot - barWidth) / 2; const y = 223 - h; return <g key={point.period}><rect x={x} y={y} width={barWidth} height={Math.max(0, h)} rx="5" fill="#4d91a5"><title>{point.period}: {point.order_count} orders</title></rect><text x={x + barWidth / 2} y="249" textAnchor="middle" fill="#708078" fontSize="11">{monthLabel(point.period)}</text></g>; })}
      </svg>
    </div>
  </div>;
}

function StatusChart({ statuses }: { statuses: ReportStatusCount[] }) {
  const total = statuses.reduce((sum, row) => sum + row.count, 0);
  const radius = 62;
  const circumference = Math.PI * radius * 2;
  let offset = 0;
  return <div className="grid gap-5 sm:grid-cols-[150px_1fr] sm:items-center">
    <div className="relative mx-auto h-36 w-36"><svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label={`Order statuses, ${total} orders`}><circle cx="80" cy="80" r={radius} fill="none" stroke="#edf1ee" strokeWidth="18" />{statuses.filter((row) => row.count > 0).map((row) => { const length = (row.count / Math.max(total, 1)) * circumference; const current = offset; offset += length; return <circle key={row.status} cx="80" cy="80" r={radius} fill="none" stroke={statusColors[statuses.indexOf(row) % statusColors.length]} strokeWidth="18" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-current}><title>{row.status}: {row.count}</title></circle>; })}</svg><div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl text-ink">{total}</strong><span className="text-[11px] text-muted">orders</span></div></div>
    <ul className="grid gap-2 sm:grid-cols-2">{statuses.map((row, index) => <li key={row.status} className="flex items-center justify-between gap-2 text-sm"><span className="flex min-w-0 items-center gap-2 text-muted"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColors[index % statusColors.length] }} />{row.status.replace(/_/g, " ")}</span><strong className="text-ink">{row.count}</strong></li>)}{statuses.length === 0 ? <li className="text-sm text-muted">No orders in this period.</li> : null}</ul>
  </div>;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadReport(report: BusinessReports) {
  const rows: Array<Array<string | number>> = [
    ["FashionOS business report", `${report.start_date} to ${report.end_date}`],
    ["Currency", report.currency],
    [],
    ["Summary metric", "Value"],
    ["Orders", report.totals.order_count],
    ["Customers with orders", report.totals.customer_count],
    ["Order value", report.totals.order_value],
    ["Collected revenue", report.totals.collected_revenue],
    ["Outstanding on period orders", report.totals.outstanding_balance],
    ["Average order value", report.totals.average_order_value],
    [],
    ["Month", "Orders", "Order value", "Collected revenue"],
    ...report.trend.map((row) => [row.period, row.order_count, row.order_value, row.collected_revenue]),
    [],
    ["Order status", "Count"],
    ...report.status_breakdown.map((row) => [row.status, row.count]),
    [],
    ["Top customer", "Orders in period", "Collected revenue"],
    ...report.top_customers.map((row) => [row.customer_name, row.order_count, row.collected_revenue]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fashionos-report-${report.start_date}-${report.end_date}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { business } = useAuth();
  const [range, setRange] = useState(initialRange);
  const reportQuery = useQuery({
    queryKey: ["business-reports", range.start, range.end],
    queryFn: () => fetchBusinessReports(range.start, range.end),
    enabled: Boolean(range.start && range.end && range.start <= range.end),
  });
  const report = reportQuery.data;
  const statusRows = useMemo(() => report?.status_breakdown ?? [], [report?.status_breakdown]);
  const moneyCurrency = report?.currency ?? business?.currency ?? "NGN";
  const totals = report?.totals;

  function setPreset(months: number) {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - months + 1, 1);
    setRange({ start: toDateInput(start), end: toDateInput(end) });
  }

  return <PageContainer>
    <PageHeader eyebrow="Business insights" title="Reports" description="Understand order demand, collections, and customer activity for your business." actions={report ? <Button variant="outline" onClick={() => downloadReport(report)}><Download className="h-4 w-4" />Export CSV</Button> : null} />
    <Card className="mt-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
      <div><p className="text-sm font-semibold text-ink">Report period</p><p className="mt-1 text-xs text-muted">Dates follow your business timezone.</p></div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-muted">From<input className="mt-1 block h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink" type="date" value={range.start} max={range.end} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} /></label>
        <label className="text-xs font-medium text-muted">To<input className="mt-1 block h-10 rounded-lg border border-border bg-white px-3 text-sm text-ink" type="date" value={range.end} min={range.start} max={toDateInput(new Date())} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} /></label>
        <Button variant="outline" onClick={() => setPreset(3)}>3 months</Button>
        <Button variant="outline" onClick={() => setPreset(12)}>12 months</Button>
      </div>
    </Card>
    {range.start > range.end ? <InlineError message="Choose a report start date on or before the end date." /> : null}
    {reportQuery.isLoading ? <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-80 sm:col-span-2 xl:col-span-4" /></div> : null}
    {reportQuery.isError ? <div className="mt-6"><InlineError message="Reports could not be loaded. Check your access or try again." retry={() => void reportQuery.refetch()} /></div> : null}
    {report && totals ? <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Collected revenue" value={formatMoney(totals.collected_revenue, moneyCurrency)} note="Successful payments received in period" icon={TrendingUp} />
        <Metric label="Order value" value={formatMoney(totals.order_value, moneyCurrency)} note={`${totals.order_count} non-cancelled orders placed`} icon={FileBarChart} />
        <Metric label="Outstanding balance" value={formatMoney(totals.outstanding_balance, moneyCurrency)} note="On non-cancelled orders placed in period" icon={BarChart3} />
        <Metric label="Customers" value={String(totals.customer_count)} note={`Average order value ${formatMoney(totals.average_order_value, moneyCurrency)}`} icon={Users} />
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="p-5 sm:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-ink">Collections over time</h2><p className="mt-1 text-sm text-muted">Successful payment totals by month</p></div><RevenueChart points={report.trend} currency={moneyCurrency} /></Card>
        <Card className="p-5 sm:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-ink">Order volume</h2><p className="mt-1 text-sm text-muted">Orders grouped by the month they were placed</p></div><OrdersChart points={report.trend} /></Card>
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.25fr]">
        <Card className="p-5 sm:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-ink">Order status mix</h2><p className="mt-1 text-sm text-muted">All orders placed in the selected period</p></div><StatusChart statuses={statusRows} /></Card>
        <Card className="p-5 sm:p-6"><div className="mb-5"><h2 className="text-base font-semibold text-ink">Top customers by collections</h2><p className="mt-1 text-sm text-muted">Successful payments received during this period, regardless of order date</p></div>
          {report.top_customers.length ? <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="pb-3">Customer</th><th className="pb-3 text-right">Orders</th><th className="pb-3 text-right">Collected</th></tr></thead><tbody className="divide-y divide-border">{report.top_customers.map((customer) => <tr key={customer.customer_id}><td className="py-3 font-medium text-ink">{customer.customer_name}</td><td className="py-3 text-right text-muted">{customer.order_count}</td><td className="py-3 text-right font-semibold text-ink">{formatMoney(customer.collected_revenue, moneyCurrency)}</td></tr>)}</tbody></table></div><ul className="divide-y divide-border md:hidden">{report.top_customers.map((customer) => <li className="py-3 first:pt-0 last:pb-0" key={customer.customer_id}><div className="flex justify-between gap-3"><strong className="text-sm text-ink">{customer.customer_name}</strong><strong className="text-sm text-ink">{formatMoney(customer.collected_revenue, moneyCurrency)}</strong></div><p className="mt-1 text-xs text-muted">{customer.order_count} orders in period</p></li>)}</ul></> : <p className="py-10 text-center text-sm text-muted">No successful customer payments in this period.</p>}
        </Card>
      </section>
      <p className="mt-5 text-xs leading-5 text-muted">Order value uses item prices, discounts, and delivery charges for non-cancelled orders placed during the period. Collected revenue counts successful payments received during the period. Outstanding balance is calculated from the successful-payment ledger for those period orders. Figures use {moneyCurrency} and are scoped to {business?.name ?? "this business"}.</p>
    </> : null}
  </PageContainer>;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof TrendingUp }) {
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-medium text-muted">{label}</p><p className="mt-2 truncate text-2xl font-semibold tracking-tight text-ink">{value}</p><p className="mt-2 text-xs leading-5 text-muted">{note}</p></div><span className="rounded-lg bg-primary-soft p-2.5 text-primary"><Icon className="h-5 w-5" /></span></div></Card>;
}
