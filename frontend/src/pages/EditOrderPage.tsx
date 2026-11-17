import { ArrowLeft, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { useOrder, useUpdateOrder } from "../hooks/useOrders";
import { useAuth } from "../hooks/useAuth";
import { useCustomers } from "../hooks/useCustomers";
import { useCustomerMeasurements } from "../hooks/useMeasurements";
import { formatMoney, moneyValue } from "../lib/money";
import {
  Card,
  InlineError,
  PageContainer,
  PageHeader,
  Skeleton,
  buttonStyles,
  inputStyles,
  textareaStyles,
} from "../components/ui";

export function EditOrderPage() {
  const { business } = useAuth();
  const currency = business?.currency ?? "NGN";
  const { orderId } = useParams();
  const navigate = useNavigate();
  const orderQuery = useOrder(orderId);
  const updateMutation = useUpdateOrder(orderId ?? "");
  const [dueDate, setDueDate] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0.00");
  const [itemPrices, setItemPrices] = useState<
    { id: string; name: string; description: string; quantity: number; unit_price: string; measurement_profile_id: string; style_reference_url: string; notes: string; position: number }[]
  >([]);
  const [deliveryCharge, setDeliveryCharge] = useState("0.00");
  const [fulfillment, setFulfillment] = useState({ method: "PICKUP" as "PICKUP" | "DELIVERY", recipient_name: "", recipient_phone: "", delivery_address: "", delivery_instructions: "", tracking_reference: "" });
  const customers = useCustomers({ page_size: 100 });
  const measurements = useCustomerMeasurements(customerId || undefined, { page_size: 100 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (orderQuery.data) {
      setDueDate(orderQuery.data.due_date);
      setOrderDate(orderQuery.data.order_date);
      setCustomerId(orderQuery.data.customer.id);
      setNotes(orderQuery.data.notes ?? "");
      setReferenceImage(orderQuery.data.reference_image ?? "");
      setDiscountAmount(orderQuery.data.discount_amount);
      setItemPrices(
        orderQuery.data.items.map((item) => ({
          id: item.id,
          name: item.garment_type,
          description: item.description ?? "",
          quantity: item.quantity,
          unit_price: item.unit_price,
          measurement_profile_id: item.measurement_profile_id ?? "",
          style_reference_url: item.style_reference_url ?? "",
          notes: item.notes ?? "",
          position: item.position,
        })),
      );
      setDeliveryCharge(orderQuery.data.delivery_charge ?? "0.00");
      setFulfillment({ method: orderQuery.data.fulfillment?.method ?? "PICKUP", recipient_name: orderQuery.data.fulfillment?.recipient_name ?? "", recipient_phone: orderQuery.data.fulfillment?.recipient_phone ?? "", delivery_address: orderQuery.data.fulfillment?.delivery_address ?? "", delivery_instructions: orderQuery.data.fulfillment?.delivery_instructions ?? "", tracking_reference: orderQuery.data.fulfillment?.tracking_reference ?? "" });
    }
  }, [orderQuery.data]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const subtotal = itemPrices.reduce(
      (sum, item) => sum + moneyValue(item.unit_price) * item.quantity,
      0,
    );
    if (moneyValue(discountAmount) > subtotal) {
      setError("Discount cannot exceed the subtotal.");
      return;
    }
    try {
      const order = await updateMutation.mutateAsync({
        due_date: dueDate,
        order_date: orderDate,
        customer_id: customerId,
        notes: notes.trim() || null,
        reference_image: referenceImage || null,
        discount_amount: discountAmount,
        delivery_charge: business?.delivery_charges_enabled ? deliveryCharge : undefined,
        items: itemPrices.map((item) => ({ ...item, description: item.description || null, measurement_profile_id: item.measurement_profile_id || null, style_reference_url: item.style_reference_url || null, notes: item.notes || null })),
        fulfillment,
      });
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (apiError) {
      setError(getApiErrorMessage(apiError));
    }
  }

  if (orderQuery.isLoading) {
    return (
      <PageContainer className="max-w-5xl">
        <Skeleton className="h-96" />
      </PageContainer>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <PageContainer className="max-w-5xl">
        <InlineError message="Order not found." />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl">
      <Link
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        to={`/orders/${orderQuery.data.id}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to order
      </Link>
      <div className="mt-5">
        <PageHeader
          title="Edit Order"
          description="Update scheduling, garment pricing, and workroom notes."
        />
      </div>
      <form
        className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        onSubmit={submit}
      >
        <Card className="space-y-6 p-5 sm:p-6">
          <label className="block">
            <span className="text-sm font-medium text-ink">Customer</span>
            <select className={inputStyles} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{(customers.data?.items ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.first_name} {customer.last_name ?? ""}</option>)}</select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Order date</span>
            <input className={inputStyles} type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Due date</span>
            <input
              className={inputStyles}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </label>
          <fieldset className="space-y-4 border-t border-border pt-6">
            <legend className="font-semibold text-ink">Pricing</legend>
            {itemPrices.map((item, index) => (
              <div className="space-y-3 rounded-lg border border-border p-3" key={item.id}>
                <label className="block"><span className="text-sm font-medium text-ink">Garment type</span><input className={inputStyles} value={item.name} onChange={(event) => setItemPrices((current) => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></label>
                <label className="block"><span className="text-sm font-medium text-ink">Description</span><textarea className={textareaStyles} value={item.description} onChange={(event) => setItemPrices((current) => current.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry))} /></label>
                <div className="grid gap-3 sm:grid-cols-2"><label><span className="text-sm font-medium text-ink">Quantity</span><input className={inputStyles} type="number" min="1" value={item.quantity} onChange={(event) => setItemPrices((current) => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label>
                <span className="text-sm font-medium text-ink">
                  {item.name} price per garment
                </span>
                <input
                  className={inputStyles}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={item.unit_price}
                  onChange={(event) =>
                    setItemPrices((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, unit_price: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                </div>
                <label className="block"><span className="text-sm font-medium text-ink">Measurement profile</span><select className={inputStyles} value={item.measurement_profile_id} onChange={(event) => setItemPrices((current) => current.map((entry, i) => i === index ? { ...entry, measurement_profile_id: event.target.value } : entry))}><option value="">No profile</option>{(measurements.data?.items ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
                <label className="block"><span className="text-sm font-medium text-ink">Style reference URL</span><input className={inputStyles} value={item.style_reference_url} onChange={(event) => setItemPrices((current) => current.map((entry, i) => i === index ? { ...entry, style_reference_url: event.target.value } : entry))} /></label>
                <label className="block"><span className="text-sm font-medium text-ink">Garment notes</span><textarea className={textareaStyles} value={item.notes} onChange={(event) => setItemPrices((current) => current.map((entry, i) => i === index ? { ...entry, notes: event.target.value } : entry))} /></label>
              </div>
            ))}
            <label className="block">
              <span className="text-sm font-medium text-ink">Discount</span>
              <input
                className={inputStyles}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
              />
            </label>
            <p className="text-sm text-stone-600">
              Subtotal{" "}
              {formatMoney(
                itemPrices.reduce(
                  (sum, item) =>
                    sum + moneyValue(item.unit_price) * item.quantity,
                  0,
                ),
                currency,
              )}
            </p>
          </fieldset>
          {business?.delivery_charges_enabled ? <label className="block"><span className="text-sm font-medium text-ink">Delivery charge</span><input className={inputStyles} type="number" min="0" step="0.01" value={deliveryCharge} onChange={(event) => setDeliveryCharge(event.target.value)} /></label> : null}
          <fieldset className="space-y-3 border-t border-border pt-5"><legend className="font-semibold">Fulfillment</legend><select className={inputStyles} value={fulfillment.method} onChange={(event) => setFulfillment((current) => ({ ...current, method: event.target.value as "PICKUP" | "DELIVERY" }))}><option value="PICKUP">Customer pickup</option><option value="DELIVERY">Business delivery</option></select><input className={inputStyles} placeholder="Recipient name" value={fulfillment.recipient_name} onChange={(event) => setFulfillment((current) => ({ ...current, recipient_name: event.target.value }))} /><input className={inputStyles} placeholder="Recipient phone" value={fulfillment.recipient_phone} onChange={(event) => setFulfillment((current) => ({ ...current, recipient_phone: event.target.value }))} />{fulfillment.method === "DELIVERY" ? <><textarea className={textareaStyles} placeholder="Delivery address" value={fulfillment.delivery_address} onChange={(event) => setFulfillment((current) => ({ ...current, delivery_address: event.target.value }))} /><textarea className={textareaStyles} placeholder="Delivery instructions" value={fulfillment.delivery_instructions} onChange={(event) => setFulfillment((current) => ({ ...current, delivery_instructions: event.target.value }))} /><input className={inputStyles} placeholder="Tracking reference" value={fulfillment.tracking_reference} onChange={(event) => setFulfillment((current) => ({ ...current, tracking_reference: event.target.value }))} /></> : null}</fieldset>
          <label className="block">
            <span className="text-sm font-medium text-ink">Notes</span>
            <textarea
              className={textareaStyles}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <label className="block"><span className="text-sm font-medium text-ink">Order reference photo optional</span><input className={inputStyles} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setError("Reference photos must be 1 MB or smaller."); return; } const reader = new FileReader(); reader.onload = () => setReferenceImage(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }} />{referenceImage ? <img className="mt-3 max-h-56 rounded-lg border border-border object-contain" src={referenceImage} alt="Order reference" /> : null}</label>
        </Card>
        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card className="p-5">
            <h2 className="font-semibold text-ink">Pricing preview</h2>
            <p className="mt-2 text-sm text-muted">
              Review the calculated subtotal before saving.
            </p>
            <div className="mt-5 rounded-lg bg-primary-soft p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Current subtotal
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {formatMoney(
                  itemPrices.reduce(
                    (sum, item) =>
                      sum + moneyValue(item.unit_price) * item.quantity,
                    0,
                  ),
                  currency,
                )}
              </p>
            </div>
          </Card>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <button
            className={buttonStyles({ size: "lg", className: "w-full" })}
            type="submit"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            Save Order
          </button>
        </aside>
      </form>
    </PageContainer>
  );
}
