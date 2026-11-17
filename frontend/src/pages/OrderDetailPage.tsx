import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Edit3,
  FileText,
  Loader2,
  Phone,
  Ruler,
  Shirt,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { OrderMaterialsPanel } from "../components/OrderMaterialsPanel";
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  InlineError,
  PageContainer,
  Skeleton,
  StatusBadge,
  SuccessNotice,
  buttonStyles,
  inputStyles,
  textareaStyles,
} from "../components/ui";
import { useAuth } from "../hooks/useAuth";
import { useCreateInvoice, useOrderInvoice } from "../hooks/useInvoices";
import {
  useCompleteOrderFulfillment,
  useDispatchOrderFulfillment,
  useOrder,
  useUpdateOrderFulfillment,
  useUpdateOrderStatus,
} from "../hooks/useOrders";
import { useCreatePayment, useOrderPayments } from "../hooks/usePayments";
import { formatDate, formatDateTime } from "../lib/date";
import { formatMoney, moneyValue } from "../lib/money";
import {
  ORDER_TRANSITIONS,
  customerFullName,
  formatStatus,
  overdueText,
} from "../lib/orders";
import type {
  OrderItem,
  OrderDetail,
  OrderStatus,
  OrderStatusHistory,
} from "../types/order";
import type { Payment, PaymentMethod } from "../types/payment";

const STATUS_GUIDANCE: Partial<Record<OrderStatus, string>> = {
  DRAFT: "Order details are being collected and confirmed.",
  CONFIRMED: "Order is approved and ready to enter production.",
  CUTTING: "Fabric is being prepared and cut to the pattern.",
  SEWING: "Garment construction is in progress.",
  FITTING: "Customer fitting or adjustment is required.",
  FINISHING: "Final stitching, pressing, and quality checks are underway.",
  READY: "Finished outfit is ready for customer collection or delivery.",
  DELIVERED: "Handoff is complete and recorded through delivery details.",
  CANCELLED: "Work is stopped and the order is closed.",
};

export function OrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { business } = useAuth();
  const orderQuery = useOrder(orderId);
  const statusMutation = useUpdateOrderStatus(orderId ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [statusNotes, setStatusNotes] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [paymentInstallmentId, setPaymentInstallmentId] = useState("");
  const [notice, setNotice] = useState("");
  const order = orderQuery.data;
  const paymentsQuery = useOrderPayments(orderId);
  const invoiceQuery = useOrderInvoice(orderId);
  const paymentMutation = useCreatePayment(
    orderId ?? "",
    order?.customer.id ?? "",
  );
  const invoiceMutation = useCreateInvoice(orderId ?? "");
  const allowedStatuses = useMemo(
    () => (order ? (business?.order_status_configuration?.transitions?.[order.status] as OrderStatus[] | undefined ?? ORDER_TRANSITIONS[order.status]).filter((status) => status !== "DELIVERED") : []),
    [order, business?.order_status_configuration],
  );
  const statusLabel = (status: string) => business?.order_status_configuration?.labels?.[status] ?? formatStatus(status);
  const currency = business?.currency ?? "NGN";

  if (orderQuery.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-40" />
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </PageContainer>
    );
  }
  if (orderQuery.isError || !order) {
    return (
      <PageContainer>
        <InlineError message="Order not found." />
      </PageContainer>
    );
  }
  const currentOrder = order;

  async function submitStatus(event: FormEvent) {
    event.preventDefault();
    if (!nextStatus) return;
    if (nextStatus === "CANCELLED" && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    setError("");
    try {
      await statusMutation.mutateAsync({
        status: nextStatus,
        notes: statusNotes.trim() || null,
      });
      setDialogOpen(false);
      setNextStatus("");
      setStatusNotes("");
      setConfirmCancel(false);
      setNotice("Order status updated successfully.");
    } catch (apiError) {
      setError(getApiErrorMessage(apiError));
    }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (moneyValue(paymentAmount) <= 0) {
      setError("Payment amount must be greater than zero.");
      return;
    }
    if (
      moneyValue(paymentAmount) > moneyValue(currentOrder.outstanding_balance)
    ) {
      setError("Payment cannot exceed the outstanding balance.");
      return;
    }
    setError("");
    try {
      await paymentMutation.mutateAsync({
        amount: paymentAmount,
        payment_method: paymentMethod,
        reference: paymentReference.trim() || null,
        notes: paymentNotes.trim() || null,
        paid_at: new Date(`${paymentDate}T12:00:00`).toISOString(),
        ...(paymentInstallmentId ? { installment_id: paymentInstallmentId, apply_automatically: false } : {}),
      });
      setPaymentOpen(false);
      setNotice("Payment recorded successfully.");
    } catch (apiError) {
      setError(getApiErrorMessage(apiError));
    }
  }

  async function generateInvoice() {
    setError("");
    try {
      const invoice = await invoiceMutation.mutateAsync();
      navigate(`/invoices/${invoice.id}`);
    } catch (apiError) {
      setError(getApiErrorMessage(apiError));
    }
  }

  return (
    <PageContainer>
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to="/orders"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to orders
      </Link>

      <header className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {order.order_number}
            </h1>
            <StatusBadge status={order.status} />
            {order.is_overdue ? (
              <StatusBadge
                status="OVERDUE"
                label={overdueText(order.overdue_days)}
              />
            ) : null}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted sm:text-base">
            <span>{customerFullName(order.customer)}</span>
            <span aria-hidden="true">·</span>
            <span>Due {formatDate(order.due_date)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoiceQuery.data ? (
            <Link
              className={buttonStyles({ variant: "outline" })}
              to={`/invoices/${invoiceQuery.data.id}`}
            >
              <FileText className="h-4 w-4" aria-hidden="true" /> View Invoice
            </Link>
          ) : (
            <Button
              variant="outline"
              disabled={invoiceQuery.isLoading || invoiceMutation.isPending}
              onClick={() => void generateInvoice()}
            >
              <FileText className="h-4 w-4" aria-hidden="true" /> Generate
              Invoice
            </Button>
          )}
          {order.status !== "DELIVERED" && order.status !== "CANCELLED" ? (
            <Link
              className={buttonStyles({ variant: "outline" })}
              to={`/orders/${order.id}/edit`}
            >
              <Edit3 className="h-4 w-4" aria-hidden="true" /> Edit
            </Link>
          ) : null}
          <Button
            disabled={allowedStatuses.length === 0}
            onClick={() => {
              setError("");
              setDialogOpen(true);
            }}
          >
            Update Status
          </Button>
        </div>
      </header>

      {notice ? (
        <div className="mt-5">
          <SuccessNotice>{notice}</SuccessNotice>
        </div>
      ) : null}
      {error && !dialogOpen && !paymentOpen ? (
        <div className="mt-5">
          <InlineError message={error} />
        </div>
      ) : null}

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {order.payment_plan ? (
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink">Installment plan</h2>
              <p className="mt-1 text-sm text-muted">
                Scheduled amounts are separate from received payments. Record a payment when funds arrive.
              </p>
              {order.payment_plan.advance_amount ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-3 text-sm">
                  <span>
                    <span className="block font-medium text-ink">Optional advance</span>
                    <span className="text-muted">
                      Due {order.payment_plan.advance_due_date ? formatDate(order.payment_plan.advance_due_date) : "on order"} · Paid {formatMoney(order.payment_plan.advance_paid_amount, currency)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge
                      status={order.payment_plan.advance_status ?? "UNPAID"}
                      label={formatStatus(order.payment_plan.advance_status ?? "UNPAID")}
                    />
                    <strong>{formatMoney(order.payment_plan.advance_outstanding_amount, currency)} left</strong>
                  </span>
                </div>
              ) : null}
              <ol className="mt-3 divide-y divide-border">
                {order.payment_plan.installments.map((installment) => (
                  <li key={installment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <span className="block font-medium text-ink">{installment.label}</span>
                      <span className="text-muted">Due {formatDate(installment.due_date)} · Paid {formatMoney(installment.paid_amount, currency)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusBadge
                        status={installment.status}
                        label={formatStatus(installment.status)}
                      />
                      <strong>{formatMoney(installment.outstanding_amount, currency)} left</strong>
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
          <FulfillmentCard
            order={order}
            timezone={business?.timezone}
            currency={currency}
            deliveryChargesEnabled={business?.delivery_charges_enabled ?? false}
          />
          {business?.enabled_features?.includes("inventory") ? <OrderMaterialsPanel orderId={order.id} /> : null}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Shirt className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-ink">Garments</h2>
                <p className="text-sm text-muted">
                  Production brief and pricing for each item.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {order.items.map((item) => (
                <GarmentCard item={item} currency={currency} key={item.id} />
              ))}
            </div>
          </Card>

          {order.notes ? (
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink">Order Notes</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                {order.notes}
              </p>
            </Card>
          ) : null}

          {order.reference_image ? <Card className="p-5 sm:p-6"><h2 className="text-lg font-semibold text-ink">Order reference photo</h2><img className="mt-4 max-h-[32rem] rounded-lg border border-border object-contain" src={order.reference_image} alt={`Reference photo for ${order.order_number}`} /></Card> : null}

          <PaymentsCard
            payments={paymentsQuery.data ?? []}
            loading={paymentsQuery.isLoading}
            outstanding={order.outstanding_balance}
            currency={currency}
            timezone={business?.timezone}
            onRecord={() => {
              setError("");
              setPaymentAmount(order.outstanding_balance);
              setPaymentOpen(true);
            }}
          />

          <ProductionTimeline
            history={order.status_history}
            timezone={business?.timezone}
          />
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24">
          <FinancialSummary order={order} currency={currency} />
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-semibold text-ink">Customer</h2>
            </div>
            <Link
              className="mt-4 block font-semibold text-primary hover:underline"
              to={`/customers/${order.customer.id}`}
            >
              {customerFullName(order.customer)}
            </Link>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted">
              <Phone className="h-4 w-4" aria-hidden="true" />{" "}
              {order.customer.phone}
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-muted">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="font-semibold text-ink">Dates</h2>
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-1">
              <DateRow label="Created" value={order.created_at} />
              <DateRow label="Order date" value={order.order_date} />
              <DateRow label="Due date" value={order.due_date} />
              {order.delivered_at ? (
                <DateRow label="Delivered" value={order.delivered_at} />
              ) : null}
              {order.cancelled_at ? (
                <DateRow label="Cancelled" value={order.cancelled_at} />
              ) : null}
            </dl>
          </Card>
        </aside>
      </div>

      <Dialog
        open={dialogOpen}
        title="Update Status"
        description={`Move ${order.order_number} forward from ${statusLabel(order.status)}.`}
        onClose={() => {
          setDialogOpen(false);
          setConfirmCancel(false);
        }}
      >
        <form onSubmit={submitStatus}>
          <label className="block">
            <span className="text-sm font-medium text-ink">Next status</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {allowedStatuses.map((statusOption) => (
                <label key={statusOption} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${nextStatus === statusOption ? "border-primary bg-primary-soft/50 ring-1 ring-primary" : "border-border hover:bg-stone-50"}`}>
                  <input className="mt-1 h-4 w-4 accent-primary" type="radio" name="next-status" value={statusOption} checked={nextStatus === statusOption} onChange={() => { setNextStatus(statusOption); setConfirmCancel(false); }} />
                  <span><span className="block text-sm font-semibold text-ink">{statusLabel(statusOption)}</span><span className="mt-1 block text-xs leading-5 text-muted">{STATUS_GUIDANCE[statusOption]}</span></span>
                </label>
              ))}
            </div>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-ink">Notes optional</span>
            <textarea
              className={textareaStyles}
              value={statusNotes}
              onChange={(event) => setStatusNotes(event.target.value)}
            />
          </label>
          {nextStatus === "CANCELLED" && confirmCancel ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Cancel this order? It will remain in history but can no longer
              move through production.
            </p>
          ) : null}
          {error ? (
            <div className="mt-4">
              <InlineError message={error} />
            </div>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              type="button"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant={
                nextStatus === "CANCELLED" && confirmCancel
                  ? "destructive"
                  : "primary"
              }
              type="submit"
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Update Status
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={paymentOpen}
        title="Record Payment"
        description={`Outstanding balance: ${formatMoney(order.outstanding_balance, currency)}`}
        onClose={() => setPaymentOpen(false)}
      >
        <form onSubmit={submitPayment}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-sm font-medium text-ink">Amount</span>
              <input
                className={inputStyles}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                required
              />
            </label>
            <label>
              <span className="text-sm font-medium text-ink">
                Payment method
              </span>
              <select
                className={inputStyles}
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
              >
                {(
                  [
                    "CASH",
                    "TRANSFER",
                    "CARD",
                    "POS",
                    "OTHER",
                  ] as PaymentMethod[]
                ).map((method) => (
                  <option key={method} value={method}>
                    {formatStatus(method)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {order.payment_plan && business?.enabled_features?.includes("installment_plans") ? (
                <span className="text-sm font-medium text-ink">Apply to installment optional</span>
              ) : null}
              {order.payment_plan && business?.enabled_features?.includes("installment_plans") ? (
                <select className={inputStyles} value={paymentInstallmentId} onChange={(event) => setPaymentInstallmentId(event.target.value)}>
                  <option value="">Apply automatically</option>
                  {order.payment_plan.installments.filter((entry) => moneyValue(entry.outstanding_amount) > 0).map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {formatMoney(entry.outstanding_amount, currency)} remaining</option>)}
                </select>
              ) : null}
            </label>
            <label>
              <span className="text-sm font-medium text-ink">
                Reference optional
              </span>
              <input
                className={inputStyles}
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </label>
            <label>
              <span className="text-sm font-medium text-ink">Payment date</span>
              <input
                className={inputStyles}
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                required
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-sm font-medium text-ink">
                Notes optional
              </span>
              <textarea
                className={textareaStyles}
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
              />
            </label>
          </div>
          {error ? (
            <div className="mt-4">
              <InlineError message={error} />
            </div>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              type="button"
              onClick={() => setPaymentOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Record Payment
            </Button>
          </div>
        </form>
      </Dialog>
    </PageContainer>
  );
}

function FulfillmentCard({
  order,
  timezone,
  currency,
  deliveryChargesEnabled,
}: {
  order: OrderDetail;
  timezone?: string;
  currency: string;
  deliveryChargesEnabled: boolean;
}) {
  const fulfillment = order.fulfillment;
  const update = useUpdateOrderFulfillment(order.id);
  const dispatch = useDispatchOrderFulfillment(order.id);
  const complete = useCompleteOrderFulfillment(order.id);
  const [method, setMethod] = useState<"PICKUP" | "DELIVERY">(fulfillment?.method ?? "PICKUP");
  const [name, setName] = useState(fulfillment?.recipient_name ?? "");
  const [phone, setPhone] = useState(fulfillment?.recipient_phone ?? "");
  const [address, setAddress] = useState(fulfillment?.delivery_address ?? "");
  const [instructions, setInstructions] = useState(fulfillment?.delivery_instructions ?? "");
  const [tracking, setTracking] = useState(fulfillment?.tracking_reference ?? "");
  const [proofPhoto, setProofPhoto] = useState("");
  const [deliveryCharge, setDeliveryCharge] = useState(order.delivery_charge ?? "0.00");
  const [error, setError] = useState("");
  const terminal = order.status === "DELIVERED" || order.status === "CANCELLED";
  const locked = terminal || Boolean(fulfillment && fulfillment.status !== "PLANNED");
  const busy = update.isPending || dispatch.isPending || complete.isPending;
  const detailsDirty = !fulfillment ||
    method !== fulfillment.method ||
    name !== (fulfillment.recipient_name ?? "") ||
    phone !== (fulfillment.recipient_phone ?? "") ||
    address !== (fulfillment.delivery_address ?? "") ||
    instructions !== (fulfillment.delivery_instructions ?? "") ||
    tracking !== (fulfillment.tracking_reference ?? "");
  const chargeDirty = deliveryChargesEnabled &&
    Math.round(moneyValue(deliveryCharge) * 100) !== Math.round(moneyValue(order.delivery_charge ?? "0.00") * 100);
  const fulfillmentDirty = detailsDirty || chargeDirty;

  useEffect(() => {
    setMethod(fulfillment?.method ?? "PICKUP");
    setName(fulfillment?.recipient_name ?? "");
    setPhone(fulfillment?.recipient_phone ?? "");
    setAddress(fulfillment?.delivery_address ?? "");
    setInstructions(fulfillment?.delivery_instructions ?? "");
    setTracking(fulfillment?.tracking_reference ?? "");
    setDeliveryCharge(order.delivery_charge ?? "0.00");
  }, [fulfillment, order.delivery_charge]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await update.mutateAsync({
        method,
        recipient_name: name.trim() || null,
        recipient_phone: phone.trim() || null,
        delivery_address: method === "DELIVERY" ? address.trim() || null : null,
        delivery_instructions: instructions.trim() || null,
        tracking_reference: tracking.trim() || null,
        delivery_charge: deliveryChargesEnabled
          ? method === "DELIVERY" ? deliveryCharge || "0.00" : "0.00"
          : null,
      });
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  async function run(action: "dispatch" | "complete") {
    setError("");
    try {
      if (action === "dispatch") await dispatch.mutateAsync({});
      else {
        if (fulfillment?.method === "DELIVERY" && !proofPhoto) {
          setError("Capture a proof photo before confirming handoff.");
          return;
        }
        await complete.mutateAsync({
          proof_of_delivery_url: proofPhoto,
        });
        setProofPhoto("");
      }
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }

  const chargeLocked = locked || Boolean(order.payment_plan) || moneyValue(order.amount_paid) > 0;
  const canComplete = Boolean(fulfillment && order.status === "READY" && fulfillment.status !== "COMPLETED");

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">Completed outfit handoff</h2>
      <p className="mt-1 text-sm text-muted">Choose customer pickup or business delivery, then record dispatch and handoff.</p>
      <form className="mt-4 space-y-4" onSubmit={save}>
        <label className="block">
          <span className="text-sm font-medium text-ink">Fulfillment method</span>
          <select className={inputStyles} value={method} disabled={locked} onChange={(event) => setMethod(event.target.value as "PICKUP" | "DELIVERY")}>
            <option value="PICKUP">Customer pickup</option>
            <option value="DELIVERY">Business delivery</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="text-sm font-medium text-ink">Recipient name optional</span><input className={inputStyles} value={name} disabled={locked} onChange={(event) => setName(event.target.value)} /></label>
          <label><span className="text-sm font-medium text-ink">Recipient phone optional</span><input className={inputStyles} type="tel" value={phone} disabled={locked} onChange={(event) => setPhone(event.target.value)} /></label>
        </div>
        {method === "DELIVERY" ? (
          <>
            <label className="block"><span className="text-sm font-medium text-ink">Delivery address</span><textarea className={textareaStyles} value={address} disabled={locked} required onChange={(event) => setAddress(event.target.value)} /></label>
            <label className="block"><span className="text-sm font-medium text-ink">Delivery instructions optional</span><textarea className={textareaStyles} value={instructions} disabled={locked} onChange={(event) => setInstructions(event.target.value)} /></label>
            <label className="block"><span className="text-sm font-medium text-ink">Tracking reference optional</span><input className={inputStyles} value={tracking} disabled={locked} onChange={(event) => setTracking(event.target.value)} /></label>
            {deliveryChargesEnabled ? (
              <label className="block">
                <span className="text-sm font-medium text-ink">Delivery charge · {currency}</span>
                <input className={inputStyles} type="number" inputMode="decimal" min="0" step="0.01" value={deliveryCharge} disabled={chargeLocked} onChange={(event) => setDeliveryCharge(event.target.value)} />
                <span className="mt-1 block text-xs text-muted">Included in the order total and invoice. Locked after an installment plan or payment.</span>
              </label>
            ) : null}
          </>
        ) : null}
        {!locked ? <Button type="submit" variant="outline" disabled={busy}>Save fulfillment details</Button> : null}
      </form>
      {fulfillment && order.status === "READY" ? (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-4">
          {canComplete && fulfillment.method === "DELIVERY" ? <label className="w-full text-sm font-medium text-ink">Capture delivery proof photo<input className={inputStyles} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("Proof photos must be 1 MB or smaller."); return; } const reader = new FileReader(); reader.onload = () => setProofPhoto(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }} /><span className="mt-1 block text-xs text-muted">A photo is required to confirm delivery.</span></label> : null}
          {fulfillment.method === "PICKUP" && method === fulfillment.method && !fulfillmentDirty && fulfillment.status === "PLANNED" ? <Button disabled={busy} onClick={() => void run("complete")}>Confirm pickup handoff</Button> : null}
          {fulfillment.method === "DELIVERY" && method === fulfillment.method && !fulfillmentDirty && fulfillment.status === "PLANNED" ? <Button disabled={busy} onClick={() => void run("dispatch")}>Mark out for delivery</Button> : null}
          {fulfillment.method === "DELIVERY" && method === fulfillment.method && !fulfillmentDirty && fulfillment.status === "OUT_FOR_DELIVERY" ? <Button disabled={busy} onClick={() => void run("complete")}>Confirm delivered to customer</Button> : null}
          {fulfillment.status === "OUT_FOR_DELIVERY" ? <StatusBadge status="OUT_FOR_DELIVERY" label="Out for delivery" /> : null}
        </div>
      ) : null}
      {fulfillment?.status === "COMPLETED" ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Handoff completed{fulfillment.completed_at ? ` ${formatDateTime(fulfillment.completed_at, timezone)}` : ""}.</p> : null}
      {fulfillment?.proof_of_delivery_url ? <img className="mt-3 max-h-80 rounded-lg border border-border object-contain" src={fulfillment.proof_of_delivery_url} alt="Proof photo of delivered outfit" /> : null}
      {error ? <div className="mt-4"><InlineError message={error} /></div> : null}
      {fulfillment?.events.length ? (
        <ol className="mt-5 space-y-3 border-t border-border pt-4">
          {fulfillment.events.map((event) => <li className="text-sm" key={event.id}><span className="font-medium text-ink">{formatStatus(event.event_type)}</span><span className="text-muted"> · {formatDateTime(event.occurred_at, timezone)} · {event.actor_name}</span>{event.notes ? <p className="mt-1 text-muted">{event.notes}</p> : null}</li>)}
        </ol>
      ) : null}
    </Card>
  );
}

function GarmentCard({
  item,
  currency,
}: {
  item: OrderItem;
  currency: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-stone-50/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{item.garment_type}</h3>
          <p className="mt-1 text-sm text-muted">Quantity {item.quantity}</p>
        </div>
        {item.status ? <StatusBadge status={item.status} /> : null}
      </div>
      {item.description ? (
        <p className="mt-3 text-sm leading-6 text-stone-700">
          {item.description}
        </p>
      ) : null}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
        <span className="text-muted">
          {formatMoney(item.unit_price, currency)} per garment
        </span>
        <strong>{formatMoney(item.line_total, currency)} total</strong>
      </div>
      {item.measurement_profile_id ? (
        <Link
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          to={`/measurement-profiles/${item.measurement_profile_id}`}
        >
          <Ruler className="h-4 w-4" aria-hidden="true" />
          {item.measurement_profile_name ?? "Measurement profile"}
        </Link>
      ) : (
        <p className="mt-3 text-sm text-muted">No measurement profile</p>
      )}
      {item.style_reference_url ? (
        <a
          className="mt-2 block text-sm font-semibold text-primary hover:underline"
          href={item.style_reference_url}
          rel="noreferrer"
          target="_blank"
        >
          Open style reference
        </a>
      ) : null}
      {item.notes ? (
        <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
          {item.notes}
        </p>
      ) : null}
    </article>
  );
}

function FinancialSummary({
  order,
  currency,
}: {
  order: NonNullable<ReturnType<typeof useOrder>["data"]>;
  currency: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-stone-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-ink">Financial Summary</h2>
        <p className="mt-1 text-sm text-muted">
          Authoritative order totals and payments.
        </p>
      </div>
      <dl className="space-y-3 p-5 text-sm">
        <FinancialRow
          label="Subtotal"
          value={order.subtotal}
          currency={currency}
        />
        <FinancialRow
          label="Discount"
          value={order.discount_amount}
          currency={currency}
        />
        {moneyValue(order.delivery_charge ?? "0.00") > 0 ? (
          <FinancialRow
            label="Delivery charge"
            value={order.delivery_charge ?? "0.00"}
            currency={currency}
          />
        ) : null}
        <div className="border-t border-border pt-3">
          <FinancialRow
            label="Total"
            value={order.total}
            currency={currency}
            strong
          />
        </div>
        <FinancialRow
          label="Paid"
          value={order.amount_paid}
          currency={currency}
        />
        <div className="rounded-lg bg-primary-soft p-3 text-primary">
          <FinancialRow
            label="Balance"
            value={order.outstanding_balance}
            currency={currency}
            strong
          />
        </div>
      </dl>
    </Card>
  );
}

function PaymentsCard({
  payments,
  loading,
  outstanding,
  currency,
  timezone,
  onRecord,
}: {
  payments: Payment[];
  loading: boolean;
  outstanding: string;
  currency: string;
  timezone?: string;
  onRecord: () => void;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Payments</h2>
          <p className="mt-1 text-sm text-muted">
            Payment history for this order.
          </p>
        </div>
        {moneyValue(outstanding) > 0 ? (
          <Button onClick={onRecord}>
            <Banknote className="h-4 w-4" aria-hidden="true" /> Record Payment
          </Button>
        ) : (
          <StatusBadge status="PAID" label="Fully Paid" />
        )}
      </div>
      {loading ? (
        <div className="mt-5">
          <Skeleton className="h-20" />
        </div>
      ) : null}
      {!loading && payments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No payments recorded for this order yet."
          description="Record a deposit or payment when funds are received."
          compact
        />
      ) : null}
      <div className="mt-5 divide-y divide-border">
        {payments.map((payment) => (
          <article
            className="flex flex-col justify-between gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            key={payment.id}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-ink">
                  {formatMoney(payment.amount, currency)}
                </p>
                <StatusBadge status={payment.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {formatStatus(payment.payment_method)}
                {payment.reference ? ` · ${payment.reference}` : ""}
              </p>
              {payment.allocations?.length ? (
                <p className="mt-1 text-xs text-muted">
                  Applied to {payment.allocations.map((allocation) => `${allocation.label} ${formatMoney(allocation.amount, currency)}`).join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="text-sm text-muted sm:text-right">
              <p>{formatDateTime(payment.paid_at, timezone)}</p>
              <p className="mt-1">Recorded by {payment.received_by_name}</p>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ProductionTimeline({
  history,
  timezone,
}: {
  history: OrderStatusHistory[];
  timezone?: string;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">Production Timeline</h2>
      <p className="mt-1 text-sm text-muted">
        A complete record of progress through the workroom.
      </p>
      <ol className="mt-6">
        {history.map((entry, index) => (
          <li key={entry.id} className="relative flex gap-4 pb-7 last:pb-0">
            {index < history.length - 1 ? (
              <span
                className="absolute left-[7px] top-4 h-full w-px bg-emerald-200"
                aria-hidden="true"
              />
            ) : null}
            <span
              className="relative z-10 mt-1 h-4 w-4 shrink-0 rounded-full border-4 border-emerald-100 bg-primary"
              aria-hidden="true"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-ink">
                  {formatStatus(entry.new_status)}
                </h3>
                <StatusBadge status={entry.new_status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {formatDateTime(entry.changed_at, timezone)} ·{" "}
                {entry.changed_by_name}
              </p>
              {entry.notes ? (
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  {entry.notes}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function FinancialRow({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;
  value: string;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}
    >
      <dt>{label}</dt>
      <dd>{formatMoney(value, currency)}</dd>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-medium text-ink">{formatDate(value)}</dd>
    </div>
  );
}
