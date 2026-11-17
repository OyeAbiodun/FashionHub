import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Bold, ExternalLink, Italic, MessageCircle, Plus, Send, Settings2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { getApiErrorMessage } from "../api/client";
import * as communicationApi from "../api/communication";
import { Button, Card, Dialog, EmptyState, InlineError, PageContainer, PageHeader, SectionHeader, StatusBadge, inputStyles, labelStyles, selectStyles } from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import type { CommunicationChannel, CommunicationRecord, MessageTemplate, ReminderCandidate } from "../types/communication";
import { formatDate } from "../lib/date";
import { formatMoney } from "../lib/money";
import { listCustomers } from "../api/customers";
import { listOrders } from "../api/orders";
import type { CustomerListItem } from "../types/customer";

const defaultReminder = "Hello {{customer_name}}, this is a reminder about order {{order_number}}. Amount outstanding: {{balance}}. Due date: {{due_date}}. Please contact us if you have any questions.";

export function CommunicationPage() {
  const client = useQueryClient();
  const { business } = useAuth();
  const [templateDialog, setTemplateDialog] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [prepareFor, setPrepareFor] = useState<ReminderCandidate | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [channel, setChannel] = useState<CommunicationChannel>("WHATSAPP");
  const [body, setBody] = useState(defaultReminder);
  const [error, setError] = useState("");

  const templatesQuery = useQuery({ queryKey: ["communication", "templates"], queryFn: communicationApi.listMessageTemplates });
  const reminderQuery = useQuery({ queryKey: ["communication", "reminders"], queryFn: () => communicationApi.listReminderCandidates() });
  const recordsQuery = useQuery({ queryKey: ["communication", "records"], queryFn: communicationApi.listCommunications });
  const customersQuery = useQuery({ queryKey: ["communication", "customers"], queryFn: () => listCustomers({ page: 1, page_size: 100, archived: false }) });
  const refresh = () => {
    setError("");
    void client.invalidateQueries({ queryKey: ["communication"] });
  };
  const templateMutation = useMutation({
    mutationFn: (input: { body: communicationApi.MessageTemplateInput; id?: string }) => communicationApi.saveMessageTemplate(input.body, input.id),
    onSuccess: () => { refresh(); setTemplateDialog(false); setEditingTemplate(null); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const archiveMutation = useMutation({ mutationFn: communicationApi.archiveMessageTemplate, onSuccess: refresh, onError: (e) => setError(getApiErrorMessage(e)) });
  const prepareMutation = useMutation({
    mutationFn: communicationApi.prepareCommunication,
    onSuccess: (record) => { refresh(); setPrepareFor(null); setComposeOpen(false); setSelectedTemplate(""); setPrepared(record); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const outcomeMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "SENT" | "FAILED" }) => communicationApi.recordCommunicationOutcome(id, status),
    onSuccess: refresh,
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const sendMutation = useMutation({
    mutationFn: communicationApi.sendCommunication,
    onSuccess: (record) => { refresh(); setPrepared(record); },
    onError: (e) => setError(getApiErrorMessage(e)),
  });
  const [prepared, setPrepared] = useState<CommunicationRecord | null>(null);
  const activeTemplates = templatesQuery.data?.filter((template) => template.is_active) ?? [];

  const openReminder = (candidate: ReminderCandidate) => {
    setPrepareFor(candidate);
    setSelectedTemplate("");
    setChannel("WHATSAPP");
    setBody(defaultReminder);
  };

  return (
    <PageContainer>
      <PageHeader eyebrow="Customer follow-up" title="Communication & reminders" description="Build personalized messages with customer and order details. Send email directly or open a prepared WhatsApp/SMS handoff." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setComposeOpen(true)}><MessageCircle className="mr-2 h-4 w-4" />New message</Button><Button onClick={() => { setEditingTemplate(null); setTemplateDialog(true); }}><Plus className="mr-2 h-4 w-4" />New template</Button></div>} />
      {error ? <div className="mt-5"><InlineError message={error} /></div> : null}
      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section>
          <SectionHeader title="Reminder candidates" description="Outstanding balances with an approaching order date or installment due date. No reminders are sent automatically." />
          {reminderQuery.isLoading ? <p className="py-8 text-sm text-muted">Finding reminders…</p> : reminderQuery.isError ? <div className="mt-4"><InlineError message="Could not load reminder candidates." retry={() => void reminderQuery.refetch()} /></div> : reminderQuery.data?.length ? <div className="mt-4 space-y-3">{reminderQuery.data.map((candidate, index) => <Card className="p-4 sm:p-5" key={`${candidate.order_id}-${candidate.due_date}-${index}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{candidate.customer_name}</h3><StatusBadge status={candidate.days_until_due < 0 ? "OVERDUE" : "PENDING"} label={candidate.days_until_due < 0 ? `${Math.abs(candidate.days_until_due)} days overdue` : candidate.days_until_due === 0 ? "Due today" : `Due in ${candidate.days_until_due} days`} /></div><p className="mt-1 text-sm text-muted">Order {candidate.order_number} · {candidate.reminder_reason}</p><p className="mt-1 text-sm">Due {formatDate(candidate.due_date)} · Outstanding {formatMoney(candidate.outstanding_balance, business?.currency ?? "NGN")}</p></div><Button variant="secondary" onClick={() => openReminder(candidate)}><MessageCircle className="mr-2 h-4 w-4" />Prepare message</Button></div></Card>)}</div> : <div className="mt-4"><EmptyState icon={BellRing} title="No reminders due" description="Outstanding order balances and installments due within the next seven days will appear here." /></div>}
        </section>
        <section>
          <SectionHeader title="Message templates" description="Use {{customer_name}}, {{business_name}}, {{order_number}}, {{due_date}}, and {{balance}} as merge fields." />
          <div className="mt-4 space-y-2">{templatesQuery.data?.map((template) => <Card className="p-4" key={template.id}><div className="flex items-start gap-3"><Settings2 className="mt-0.5 h-4 w-4 text-muted" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-semibold">{template.name}</p><StatusBadge status={template.channel} label={template.channel.toLowerCase()} /></div><p className="mt-1 line-clamp-2 text-xs text-muted">{template.body}</p><div className="mt-2 flex gap-3"><button className="text-xs font-medium text-primary underline" type="button" onClick={() => { setEditingTemplate(template); setTemplateDialog(true); }}>Edit</button>{template.is_active ? <button className="text-xs text-muted underline" type="button" onClick={() => archiveMutation.mutate(template.id)}>Archive</button> : <span className="text-xs text-muted">Archived</span>}</div></div></div></Card>)}{templatesQuery.data?.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">No templates saved. You can still prepare a message from a reminder.</p> : null}</div>
        </section>
      </div>
      <section className="mt-10">
        <SectionHeader title="Communication history" description="Email sends are submitted through platform SMTP and recorded. WhatsApp and SMS currently use prepared external handoffs." />
        {recordsQuery.isLoading ? <p className="py-6 text-sm text-muted">Loading history…</p> : recordsQuery.data?.length ? <div className="mt-4 grid gap-3">{recordsQuery.data.map((record) => <Card className="p-4" key={record.id}><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{record.customer_name}</h3><StatusBadge status={record.status} label={record.status.toLowerCase()} /><StatusBadge status={record.channel} label={record.channel.toLowerCase()} /></div><p className="mt-1 text-xs text-muted">{record.order_number ? `Order ${record.order_number} · ` : ""}{formatDate(record.created_at)} · {record.created_by_name}</p><p className="mt-2 whitespace-pre-wrap text-sm">{record.body}</p></div><div className="flex shrink-0 flex-wrap gap-2">{record.status !== "SENT" ? record.channel === "EMAIL" && record.status === "PREPARED" ? <><Button size="sm" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate(record.id)}><Send className="mr-1.5 h-4 w-4" />Send email now</Button><Button variant="ghost" size="sm" onClick={() => outcomeMutation.mutate({ id: record.id, status: "FAILED" })}>Record failed</Button></> : <><a className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-stone-50" href={record.handoff_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open handoff</a><Button size="sm" onClick={() => outcomeMutation.mutate({ id: record.id, status: "SENT" })}><Send className="mr-1.5 h-4 w-4" />I sent this message</Button><Button variant="ghost" size="sm" onClick={() => outcomeMutation.mutate({ id: record.id, status: "FAILED" })}>Record failed</Button></> : null}</div></div>{record.attempts.length ? <p className="mt-3 border-t border-border pt-3 text-xs text-muted">Last outcome: {record.attempts[record.attempts.length - 1].status.toLowerCase()}{record.attempts[record.attempts.length - 1].note ? ` · ${record.attempts[record.attempts.length - 1].note}` : ""}</p> : null}</Card>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted">Customer message history will appear here after you prepare your first message.</p>}
      </section>

      {templateDialog ? <TemplateDialog template={editingTemplate} onClose={() => { setTemplateDialog(false); setEditingTemplate(null); }} onSave={(bodyValue) => templateMutation.mutate({ body: bodyValue, id: editingTemplate?.id })} saving={templateMutation.isPending} /> : null}
      {composeOpen ? <ComposeDialog businessName={business?.name ?? "Your business"} currency={business?.currency ?? "NGN"} customers={customersQuery.data?.items ?? []} templates={activeTemplates} loadingCustomers={customersQuery.isLoading} onClose={() => setComposeOpen(false)} onPrepare={(payload) => prepareMutation.mutate(payload)} saving={prepareMutation.isPending} /> : null}
      {prepareFor ? <PrepareDialog candidate={prepareFor} templates={activeTemplates} channel={channel} onChannel={setChannel} selectedTemplate={selectedTemplate} onTemplate={(id) => { setSelectedTemplate(id); const match = activeTemplates.find((template) => template.id === id); if (match) { setChannel(match.channel); setBody(match.body); } else { setBody(defaultReminder); } }} body={body} onBody={setBody} onClose={() => setPrepareFor(null)} onPrepare={() => prepareMutation.mutate({ customer_id: prepareFor.customer_id, order_id: prepareFor.order_id, template_id: selectedTemplate || undefined, channel: selectedTemplate ? undefined : channel, body: selectedTemplate ? undefined : body })} saving={prepareMutation.isPending} /> : null}
      {prepared ? <Dialog title={prepared.status === "SENT" ? "Message sent" : "Message ready to send"} description={prepared.channel === "EMAIL" ? "Send directly using the protected platform email configuration." : "Open the selected channel with this customer and message filled in."} onClose={() => setPrepared(null)} footer={<Button variant="outline" onClick={() => setPrepared(null)}>Close</Button>}><div className="space-y-4"><div><p className="text-sm">To <strong>{prepared.customer_name}</strong> at {prepared.recipient} via {prepared.channel.toLowerCase()}</p><p className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-stone-50 p-3 text-sm">{prepared.body}</p></div>{prepared.status === "SENT" ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">FashionOS submitted this email to the configured platform email service.</p> : <div className="flex flex-wrap gap-2">{prepared.channel === "EMAIL" ? <Button disabled={sendMutation.isPending} onClick={() => sendMutation.mutate(prepared.id)}><Send className="mr-2 h-4 w-4" />{sendMutation.isPending ? "Sending…" : "Send email now"}</Button> : null}<a className="inline-flex items-center rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-stone-50" href={prepared.handoff_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open {prepared.channel.toLowerCase()} handoff</a>{prepared.channel !== "EMAIL" ? <Button variant="secondary" disabled={outcomeMutation.isPending} onClick={() => outcomeMutation.mutate({ id: prepared.id, status: "SENT" })}>I sent this message</Button> : null}</div>}{prepared.channel === "EMAIL" ? <p className="text-xs leading-5 text-muted">Direct email requires platform SMTP to be configured and enabled. WhatsApp and SMS still require a connected provider; their handoffs need a staff member to press Send.</p> : <p className="text-xs leading-5 text-muted">The customer receives the WhatsApp or SMS after you press Send in the opened app. Confirm the outcome here afterwards.</p>}</div></Dialog> : null}
    </PageContainer>
  );
}

function ComposeDialog({ businessName, currency, customers, templates, loadingCustomers, onClose, onPrepare, saving }: { businessName: string; currency: string; customers: CustomerListItem[]; templates: MessageTemplate[]; loadingCustomers: boolean; onClose: () => void; onPrepare: (payload: { customer_id: string; order_id?: string; template_id?: string; channel?: CommunicationChannel; body?: string }) => void; saving: boolean }) {
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [channel, setChannel] = useState<CommunicationChannel>("WHATSAPP");
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState("Hello {{customer_name}}, your order {{order_number}} is currently in progress. Please contact {{business_name}} if you have any questions.");
  const ordersQuery = useQuery({ queryKey: ["communication", "customer-orders", customerId], queryFn: () => listOrders({ customer_id: customerId, page: 1, page_size: 100 }), enabled: Boolean(customerId) });
  const customer = customers.find((item) => item.id === customerId);
  const order = ordersQuery.data?.items.find((item) => item.id === orderId);
  const selectedTemplate = templates.find((item) => item.id === templateId);
  const source = selectedTemplate?.body ?? message;
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
  const mergeValues: Record<string, string> = { customer_name: customerName, business_name: businessName, order_number: order?.order_number ?? "Select an order", due_date: order?.due_date ? formatDate(order.due_date) : "", balance: order?.outstanding_balance ? formatMoney(order.outstanding_balance, currency) : "" };
  const preview = source.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) => mergeValues[key] ?? "");
  const chooseTemplate = (id: string) => { setTemplateId(id); const item = templates.find((template) => template.id === id); if (item) setChannel(item.channel); };
  const save = () => { if (!customerId) return; onPrepare({ customer_id: customerId, order_id: orderId || undefined, template_id: templateId || undefined, channel: templateId ? undefined : channel, body: templateId ? undefined : message }); };
  return <Dialog title="Compose customer message" description="Choose a customer and related order, then review the personalized message before opening the delivery handoff." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !customerId || (!templateId && !message.trim())} onClick={save}>{saving ? "Preparing…" : "Prepare message"}</Button></>}>
    <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-4">
      <Field label="Customer"><select className={selectStyles} value={customerId} onChange={(e) => { setCustomerId(e.target.value); setOrderId(""); }}><option value="">{loadingCustomers ? "Loading customers…" : "Select a customer"}</option>{customers.map((item) => <option key={item.id} value={item.id}>{[item.first_name, item.last_name].filter(Boolean).join(" ")} · {item.phone}</option>)}</select></Field>
      <Field label="Related order (optional)"><select className={selectStyles} value={orderId} disabled={!customerId || ordersQuery.isLoading} onChange={(e) => setOrderId(e.target.value)}><option value="">{ordersQuery.isLoading ? "Loading orders…" : "No order selected"}</option>{ordersQuery.data?.items.map((item) => <option key={item.id} value={item.id}>{item.order_number} · {item.garment_summary} · {formatMoney(item.outstanding_balance, currency)} due</option>)}</select></Field>
      <Field label="Delivery channel"><select className={selectStyles} value={channel} disabled={Boolean(templateId)} onChange={(e) => setChannel(e.target.value as CommunicationChannel)}><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL" disabled={!customer?.email}>Email{customer?.email ? "" : " · customer has no email"}</option></select></Field>
      <Field label="Message template"><select className={selectStyles} value={templateId} onChange={(e) => chooseTemplate(e.target.value)}><option value="">Start from a message layout</option>{templates.filter((item) => item.channel === channel).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      {!templateId ? <MessageVisualEditor label="Message content" value={message} onChange={setMessage} /> : <p className="rounded-lg bg-primary-soft/40 p-3 text-sm text-muted">Using “{selectedTemplate?.name}”. The selected customer and order details will fill its personalization fields.</p>}
    </div><div className="rounded-xl border border-border bg-stone-50 p-4"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted">Live customer preview</p><p className="mt-1 font-semibold text-ink">{businessName}</p></div><StatusBadge status={channel} label={channel.toLowerCase()} /></div><div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><p className="mb-3 text-xs text-muted">To: {channel === "EMAIL" ? customer?.email || "Select a customer with email" : customer?.phone || "Select a customer"}</p><div className="whitespace-pre-wrap text-sm leading-6 text-ink" dangerouslySetInnerHTML={{ __html: renderMessageMarkup(preview || "Your message preview will appear here.") }} /></div>{order ? <div className="mt-3 rounded-lg border border-border bg-white p-3 text-xs text-muted"><strong className="text-ink">Order {order.order_number}</strong><span className="mt-1 block">{order.garment_summary} · Due {formatDate(order.due_date)} · Balance {formatMoney(order.outstanding_balance, currency)}</span></div> : <p className="mt-3 text-xs text-muted">Select an order to include its number, due date, and balance.</p>}<p className="mt-4 text-xs leading-5 text-muted">Preparing creates a message record. The handoff opens WhatsApp, SMS, or email with this message filled in; the staff member must press Send in that channel for the customer to receive it.</p></div></div>
  </Dialog>;
}

function TemplateDialog({ template, onClose, onSave, saving }: { template: MessageTemplate | null; onClose: () => void; onSave: (body: communicationApi.MessageTemplateInput) => void; saving: boolean }) {
  const [name, setName] = useState(template?.name ?? "");
  const [channel, setChannel] = useState<CommunicationChannel>(template?.channel ?? "WHATSAPP");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? defaultReminder);
  const sampleValues: Record<string, string> = { customer_name: "Amina Yusuf", business_name: "Your Fashion House", order_number: "ORD-0042", due_date: "20 Nov 2026", balance: "₦25,000.00" };
  const sample = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) => sampleValues[key] ?? "");
  return <Dialog title={template ? "Edit message template" : "Create message template"} description="Build a reusable message layout and see how its personalized fields will look to a customer." onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !name.trim() || !body.trim()} onClick={() => onSave({ name, channel, subject: subject || undefined, body, is_active: template?.is_active ?? true })}>{saving ? "Saving…" : "Save template"}</Button></>}><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Template name"><input className={inputStyles} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Channel"><select className={selectStyles} value={channel} onChange={(e) => setChannel(e.target.value as CommunicationChannel)}><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">Email</option></select></Field></div>{channel === "EMAIL" ? <Field label="Email subject"><input className={inputStyles} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field> : null}<div className="grid gap-4 lg:grid-cols-2"><div><div className="flex flex-wrap items-center justify-between gap-2"><span className={labelStyles}>Compose message</span><span className="text-xs text-muted">Add personalization fields</span></div><div className="mt-2 flex flex-wrap gap-1">{["customer_name", "business_name", "order_number", "due_date", "balance"].map((key) => <button key={key} type="button" className="rounded-full border border-primary/20 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary hover:bg-emerald-100" onClick={() => setBody((current) => `${current} {{${key}}}`)}>+ {key.replace(/_/g, " ")}</button>)}</div><MessageVisualEditor label="Template message content" value={body} onChange={setBody} /></div><div className="rounded-xl border border-border bg-stone-50 p-4"><div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Customer view</p><p className="mt-1 font-semibold">Your Fashion House</p></div><StatusBadge status={channel} label={channel.toLowerCase()} /></div>{channel === "EMAIL" ? <p className="mt-3 border-b border-border pb-2 text-xs text-muted">Subject: {subject || "Your order update"}</p> : null}<div className="mt-3 rounded-xl border border-emerald-100 bg-white p-4 text-sm leading-6 text-ink shadow-sm"><div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderMessageMarkup(sample) }} /></div><p className="mt-3 text-xs text-muted">Sample fields are replaced with the selected customer's saved details and order information when a message is prepared.</p></div></div><p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Messages currently open a WhatsApp, SMS, or email handoff. Direct sending and delivery receipts require a connected provider; the handoff alone cannot confirm a customer received the message.</p></div></Dialog>;
}

function PrepareDialog({ candidate, templates, channel, onChannel, selectedTemplate, onTemplate, body, onBody, onClose, onPrepare, saving }: { candidate: ReminderCandidate; templates: MessageTemplate[]; channel: CommunicationChannel; onChannel: (value: CommunicationChannel) => void; selectedTemplate: string; onTemplate: (id: string) => void; body: string; onBody: (value: string) => void; onClose: () => void; onPrepare: () => void; saving: boolean }) {
  const matchesChannel = templates.filter((template) => template.channel === channel);
  return <Dialog title={`Prepare message for ${candidate.customer_name}`} description={`${candidate.reminder_reason} · ${candidate.order_number}`} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={saving || !selectedTemplate && !body.trim()} onClick={onPrepare}>{saving ? "Preparing…" : "Prepare handoff"}</Button></>}><div className="grid gap-4"><Field label="Channel"><select className={selectStyles} value={channel} disabled={Boolean(selectedTemplate)} onChange={(e) => { onChannel(e.target.value as CommunicationChannel); onTemplate(""); }}><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL" disabled={!candidate.email}>Email{candidate.email ? "" : " (no customer email)"}</option></select></Field><Field label="Template (optional)"><select className={selectStyles} value={selectedTemplate} onChange={(e) => onTemplate(e.target.value)}><option value="">Write a reminder</option>{matchesChannel.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select></Field>{!selectedTemplate ? <div><MessageVisualEditor label="Reminder message" value={body} onChange={onBody} /><span className="text-xs text-muted">Placeholders: customer_name, business_name, order_number, due_date, balance.</span></div> : <p className="rounded-lg bg-stone-50 p-3 text-sm text-muted">The template placeholders will be filled with this customer and order information.</p>}<p className="text-xs text-muted">Recipient: {channel === "EMAIL" ? candidate.email : candidate.phone}. This creates a handoff link; no message is sent by FashionOS.</p></div></Dialog>;
}

const MESSAGE_FIELDS = ["customer_name", "business_name", "order_number", "due_date", "balance"] as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderMessageMarkup(value: string): string {
  return escapeHtml(value)
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, field: string) => `<span class="rounded bg-emerald-50 px-1 font-medium text-emerald-800">{{${field}}}</span>`)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br />");
}

function messageMarkupToText(editor: HTMLElement): string {
  const copy = editor.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("br").forEach((node) => node.replaceWith(document.createTextNode("\n")));
  copy.querySelectorAll("strong, b").forEach((node) => node.replaceWith(document.createTextNode(`*${node.textContent ?? ""}*`)));
  copy.querySelectorAll("em, i").forEach((node) => node.replaceWith(document.createTextNode(`_${node.textContent ?? ""}_`)));
  copy.querySelectorAll("div, p").forEach((node) => node.append(document.createTextNode("\n")));
  return (copy.innerText || copy.textContent || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function MessageVisualEditor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editor.current && document.activeElement !== editor.current) {
      editor.current.innerHTML = renderMessageMarkup(value);
    }
  }, [value]);

  function applyStyle(command: "bold" | "italic") {
    editor.current?.focus();
    document.execCommand(command);
    if (editor.current) onChange(messageMarkupToText(editor.current));
  }

  function insertField(field: string) {
    editor.current?.focus();
    document.execCommand("insertText", false, `{{${field}}}`);
    if (editor.current) onChange(messageMarkupToText(editor.current));
  }

  return <div className="mt-2 overflow-hidden rounded-lg border border-border bg-white shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-stone-50 p-2" aria-label="Message formatting toolbar">
      <button type="button" className="rounded p-2 text-slate-600 hover:bg-white hover:text-primary" aria-label="Bold selected text" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStyle("bold")}><Bold className="h-4 w-4" /></button>
      <button type="button" className="rounded p-2 text-slate-600 hover:bg-white hover:text-primary" aria-label="Italic selected text" title="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => applyStyle("italic")}><Italic className="h-4 w-4" /></button>
      <span className="mx-1 h-5 border-l border-border" />
      {MESSAGE_FIELDS.map((field) => <button key={field} type="button" className="rounded-full border border-primary/20 bg-primary-soft px-2 py-1 text-[11px] font-medium text-primary hover:bg-emerald-100" onMouseDown={(event) => event.preventDefault()} onClick={() => insertField(field)}>+ {field.replace(/_/g, " ")}</button>)}
    </div>
    <div ref={editor} role="textbox" aria-label={label} aria-multiline="true" contentEditable suppressContentEditableWarning onInput={(event) => onChange(messageMarkupToText(event.currentTarget))} className="min-h-36 max-h-72 overflow-y-auto whitespace-pre-wrap px-3 py-3 text-sm leading-6 text-ink outline-none" />
    <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-muted">Select text to format it. Personalization fields fill from the selected customer and order.</div>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5"><span className={labelStyles}>{label}</span>{children}</label>; }
