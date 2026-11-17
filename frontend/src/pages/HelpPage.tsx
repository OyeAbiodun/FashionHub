import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpenCheck, CircleHelp, LifeBuoy } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, PageContainer, PageHeader } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { fetchPlatformSupportContact } from "../api/admin";

const checklist = [
  ["profile", "Add your business name, contact details, currency and timezone", "/settings"],
  ["customers", "Add customers and their contact details", "/customers"],
  ["measurements", "Record customer measurements or create a measurement profile", "/measurements"],
  ["orders", "Create an order, add garments, due date and reference photos", "/orders/new"],
  ["payments", "Record the initial payment and review the balance", "/payments"],
  ["tasks", "Assign production work and move tasks across the board", "/tasks"],
  ["reports", "Review business performance and export a report", "/reports"],
] as const;

const faqs = [
  ["How do I start with a new customer?", "Open Customers, add the customer, then save their measurements before creating an order. A measurement profile can be selected on the order."],
  ["How do I update order progress?", "Open the order and use Update Status to choose a configured next step. The order timeline records the change. Delivered and cancelled orders are terminal."],
  ["How do I record an advance or installment?", "Open the order and choose Record Payment. Enter the amount received and payment method; the remaining balance is calculated from successful payment records."],
  ["How do I track production tasks?", "Create tasks from Tasks, assign a team member and priority, then drag a task to another board column or use its status menu."],
  ["Where do I find reports?", "Open Reports to review revenue, order and payment summaries, select a date range and export the available report data."],
  ["How do staff join the workspace?", "A business admin invites staff from Team. The invitation link is sent to the staff member, who sets their own password."],
  ["Who can change business settings?", "Business owners/admins manage the workspace settings and team access. Platform-wide plans and billing are managed separately by a FashionOS Super Admin."],
] as const;

export function HelpPage() {
  const { business, user } = useAuth();
  const supportQuery = useQuery({ queryKey: ["platform", "support-contact"], queryFn: fetchPlatformSupportContact });
  const storageKey = `fashionos-guide:${business?.id ?? user?.id ?? "workspace"}`;
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as string[]; } catch { return []; }
  });
  const progress = useMemo(() => Math.round((completed.length / checklist.length) * 100), [completed]);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(completed)); }, [completed, storageKey]);

  return <PageContainer className="max-w-6xl">
    <PageHeader eyebrow="Help center" title="Guides & support" description="A practical checklist and answers to common FashionOS questions." />
    <div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">Getting started to-do</h2></div><p className="mt-1 text-sm text-muted">Use the links to visit each area. Your checklist progress stays in this browser.</p></div><span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">{completed.length}/{checklist.length} complete</span></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
        <div className="mt-4 divide-y divide-border">{checklist.map(([id, text, route]) => <div key={id} className="flex items-center gap-3 py-3"><input className="h-4 w-4 accent-primary" type="checkbox" aria-label={`Mark complete: ${text}`} checked={completed.includes(id)} onChange={(event) => setCompleted((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} /><Link className="min-w-0 flex-1 text-sm text-ink hover:text-primary" to={route}>{text}</Link><Link aria-label={`Open ${text}`} className="rounded p-1 text-muted hover:text-primary" to={route}><ArrowUpRight className="h-4 w-4" /></Link></div>)}</div>
        <button className="mt-3 text-xs font-medium text-muted underline hover:text-ink" type="button" onClick={() => setCompleted([])}>Reset checklist</button>
      </Card>
      <Card className="p-5 sm:p-7">
        <div className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-primary" /><h2 className="font-semibold">Support reach</h2></div>
        {supportQuery.data?.support_email || supportQuery.data?.support_whatsapp ? <><p className="mt-2 text-sm text-muted">Contact FashionOS support:</p><div className="mt-4 space-y-2">{supportQuery.data.support_email ? <a className="block break-all text-sm font-medium text-primary underline" href={`mailto:${supportQuery.data.support_email}`}>{supportQuery.data.support_email}</a> : null}{supportQuery.data.support_whatsapp ? <a className="block text-sm font-medium text-primary underline" href={`https://wa.me/${supportQuery.data.support_whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp {supportQuery.data.support_whatsapp}</a> : null}</div></> : <p className="mt-2 text-sm text-muted">FashionOS support contact has not been published yet. The Super Admin can configure an email or WhatsApp number in Platform Settings.</p>}
        {business?.email || business?.phone ? <p className="mt-4 rounded-lg border border-border bg-stone-50 p-3 text-xs leading-5 text-muted">For workspace-specific questions, contact {business.email || business.phone}.</p> : null}
        {user?.role === "SUPER_ADMIN" ? <Link to="/admin" className="mt-3 inline-flex text-sm font-semibold text-primary underline">Open Platform Settings</Link> : null}
      </Card>
    </div>
    <Card className="mt-5 p-5 sm:p-7"><div className="flex items-center gap-2"><CircleHelp className="h-5 w-5 text-primary" /><h2 className="font-semibold">Frequently asked questions</h2></div><div className="mt-3 divide-y divide-border">{faqs.map(([question, answer]) => <details key={question} className="group py-3"><summary className="cursor-pointer list-none pr-6 text-sm font-semibold text-ink marker:hidden">{question}<span className="float-right text-muted group-open:rotate-45">＋</span></summary><p className="mt-2 max-w-4xl text-sm leading-6 text-muted">{answer}</p></details>)}</div></Card>
  </PageContainer>;
}
