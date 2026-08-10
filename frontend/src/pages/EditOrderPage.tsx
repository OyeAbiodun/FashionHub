import { ArrowLeft, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { useOrder, useUpdateOrder } from "../hooks/useOrders";
import { useAuth } from "../hooks/useAuth";
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
  const [notes, setNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0.00");
  const [itemPrices, setItemPrices] = useState<
    { id: string; name: string; quantity: number; unit_price: string }[]
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (orderQuery.data) {
      setDueDate(orderQuery.data.due_date);
      setNotes(orderQuery.data.notes ?? "");
      setDiscountAmount(orderQuery.data.discount_amount);
      setItemPrices(
        orderQuery.data.items.map((item) => ({
          id: item.id,
          name: item.garment_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      );
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
        notes: notes.trim() || null,
        discount_amount: discountAmount,
        items: itemPrices.map(({ id, unit_price }) => ({ id, unit_price })),
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
              <label className="block" key={item.id}>
                <span className="text-sm font-medium text-ink">
                  {item.name} unit price
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
              </label>
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
          <label className="block">
            <span className="text-sm font-medium text-ink">Notes</span>
            <textarea
              className={textareaStyles}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
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
