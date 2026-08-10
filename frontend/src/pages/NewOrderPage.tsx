import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Loader2,
  Plus,
  Shirt,
  Trash2,
  UserRound,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getApiErrorMessage } from "../api/client";
import { useCustomer, useCustomers } from "../hooks/useCustomers";
import { useCustomerMeasurements } from "../hooks/useMeasurements";
import { useCreateOrder } from "../hooks/useOrders";
import { useAuth } from "../hooks/useAuth";
import { customerFullName } from "../lib/orders";
import { decimalProduct, formatMoney, moneyValue } from "../lib/money";
import type { CreateOrderItemInput } from "../types/order";
import {
  Card,
  PageContainer,
  PageHeader,
  buttonStyles,
  inputStyles,
  textareaStyles,
} from "../components/ui";

interface DraftItem {
  garment_type: string;
  description: string;
  quantity: number;
  unit_price: string;
  measurement_profile_id: string;
  style_reference_url: string;
  notes: string;
}

const blankItem = (): DraftItem => ({
  garment_type: "",
  description: "",
  quantity: 1,
  unit_price: "0.00",
  measurement_profile_id: "",
  style_reference_url: "",
  notes: "",
});

export function NewOrderPage() {
  const { business } = useAuth();
  const currency = business?.currency ?? "NGN";
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedCustomerId = searchParams.get("customerId") ?? "";
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState(preselectedCustomerId);
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0.00");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const customersQuery = useCustomers({
    search: customerSearch || undefined,
    page_size: 20,
  });
  const selectedCustomerQuery = useCustomer(customerId || undefined);
  const measurementsQuery = useCustomerMeasurements(customerId || undefined, {
    page_size: 100,
  });
  const createMutation = useCreateOrder();

  const customers = customersQuery.data?.items ?? [];
  const profiles = measurementsQuery.data?.items ?? [];
  const selectedCustomerName = useMemo(() => {
    const customer = selectedCustomerQuery.data;
    return customer ? customerFullName(customer) : "";
  }, [selectedCustomerQuery.data]);
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + moneyValue(item.unit_price) * item.quantity,
        0,
      ),
    [items],
  );
  const total = Math.max(subtotal - moneyValue(discountAmount), 0);

  useEffect(() => {
    if (preselectedCustomerId) {
      setCustomerId(preselectedCustomerId);
    }
  }, [preselectedCustomerId]);

  function changeCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    setItems((current) =>
      current.map((item) => ({ ...item, measurement_profile_id: "" })),
    );
    setNotice(
      "Measurement profile selections were cleared for the new customer.",
    );
  }

  function updateItem(index: number, updates: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  }

  function removeItem(index: number) {
    setItems((current) =>
      current.filter((_item, itemIndex) => itemIndex !== index),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one garment.");
      return;
    }
    if (!dueDate) {
      setError("Select a due date.");
      return;
    }
    const payloadItems: CreateOrderItemInput[] = items.map((item, index) => ({
      garment_type: item.garment_type,
      description: item.description.trim() || null,
      quantity: item.quantity,
      unit_price: item.unit_price || "0.00",
      measurement_profile_id: item.measurement_profile_id || null,
      style_reference_url: item.style_reference_url.trim() || null,
      notes: item.notes.trim() || null,
      position: index + 1,
    }));
    if (payloadItems.some((item) => !item.garment_type.trim())) {
      setError("Each garment needs a garment type.");
      return;
    }
    if (payloadItems.some((item) => moneyValue(item.unit_price) < 0)) {
      setError("Unit price cannot be negative.");
      return;
    }
    if (
      moneyValue(discountAmount) < 0 ||
      moneyValue(discountAmount) > subtotal
    ) {
      setError("Discount cannot exceed the subtotal.");
      return;
    }
    setError("");
    try {
      const order = await createMutation.mutateAsync({
        customer_id: customerId,
        order_date: orderDate,
        due_date: dueDate,
        notes: notes.trim() || null,
        discount_amount: discountAmount || "0.00",
        items: payloadItems,
      });
      navigate(`/orders/${order.id}`, { replace: true });
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
      <div className="mt-5">
        <PageHeader
          title="Create Order"
          description="Build the garment brief, schedule production, and confirm pricing."
        />
      </div>
      <ol
        className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Order creation steps"
      >
        <Step icon={UserRound} number={1} label="Customer" />
        <Step icon={Shirt} number={2} label="Garments" />
        <Step icon={CalendarDays} number={3} label="Schedule" />
        <Step icon={BadgeCheck} number={4} label="Review" />
      </ol>
      <form className="mt-6" onSubmit={submit}>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="p-5 sm:p-6">
              <StepHeading
                number={1}
                title="Customer"
                description="Choose who this order belongs to."
              />
              <label className="mt-4 block">
                <span className="text-sm font-medium text-ink">
                  Search customer
                </span>
                <input
                  className={inputStyles}
                  placeholder="Search customer name or phone"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                />
              </label>
              <label className="mt-4 block">
                <span className="text-sm font-medium text-ink">
                  Selected customer
                </span>
                <select
                  className={inputStyles}
                  value={customerId}
                  onChange={(event) => changeCustomer(event.target.value)}
                >
                  <option value="">Choose customer</option>
                  {selectedCustomerQuery.data &&
                  !customers.some((customer) => customer.id === customerId) ? (
                    <option value={selectedCustomerQuery.data.id}>
                      {selectedCustomerName}
                    </option>
                  ) : null}
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {[customer.first_name, customer.last_name]
                        .filter(Boolean)
                        .join(" ")}{" "}
                      · {customer.phone}
                    </option>
                  ))}
                </select>
              </label>
              {selectedCustomerName ? (
                <p className="mt-3 text-sm text-stone-600">
                  Order for {selectedCustomerName}
                </p>
              ) : null}
            </Card>

            {notice ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {notice}
              </p>
            ) : null}

            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <StepHeading
                  number={2}
                  title="Garments"
                  description="Add every item included in this order."
                />
                <button
                  className={buttonStyles({ variant: "outline", size: "sm" })}
                  type="button"
                  onClick={() =>
                    setItems((current) => [...current, blankItem()])
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Another Garment
                </button>
              </div>
              {items.length === 0 ? (
                <p className="mt-4 text-sm text-red-700">
                  Add at least one garment.
                </p>
              ) : null}
              <div className="mt-4 space-y-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-border bg-stone-50/50 p-4 sm:p-5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-ink">
                        Garment {index + 1}
                      </p>
                      <button
                        className={buttonStyles({
                          variant: "ghost",
                          size: "sm",
                          className: "h-9 w-9 px-0 text-danger",
                        })}
                        type="button"
                        aria-label="Remove garment"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="text-sm font-medium text-ink">
                          Garment type
                        </span>
                        <input
                          className={inputStyles}
                          value={item.garment_type}
                          required
                          onChange={(event) =>
                            updateItem(index, {
                              garment_type: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span className="text-sm font-medium text-ink">
                          Unit price
                        </span>
                        <input
                          className={inputStyles}
                          aria-label={`Unit price garment ${index + 1}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(event) =>
                            updateItem(index, {
                              unit_price: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="self-end rounded-lg border border-border bg-white px-3 py-3 text-sm">
                        <span className="text-stone-600">Line total </span>
                        <strong>
                          {formatMoney(
                            decimalProduct(item.unit_price, item.quantity),
                            currency,
                          )}
                        </strong>
                      </div>
                      <label>
                        <span className="text-sm font-medium text-ink">
                          Quantity
                        </span>
                        <input
                          className={inputStyles}
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(index, {
                              quantity: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        <span className="text-sm font-medium text-ink">
                          Measurement profile
                        </span>
                        <select
                          className={inputStyles}
                          value={item.measurement_profile_id}
                          disabled={!customerId}
                          onChange={(event) =>
                            updateItem(index, {
                              measurement_profile_id: event.target.value,
                            })
                          }
                        >
                          <option value="">No measurement profile</option>
                          {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name} · {profile.garment_type} ·{" "}
                              {profile.unit}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="text-sm font-medium text-ink">
                          Style reference URL
                        </span>
                        <input
                          className={inputStyles}
                          value={item.style_reference_url}
                          onChange={(event) =>
                            updateItem(index, {
                              style_reference_url: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="sm:col-span-2">
                        <span className="text-sm font-medium text-ink">
                          Description
                        </span>
                        <input
                          className={inputStyles}
                          value={item.description}
                          onChange={(event) =>
                            updateItem(index, {
                              description: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="sm:col-span-2">
                        <span className="text-sm font-medium text-ink">
                          Notes
                        </span>
                        <textarea
                          className={textareaStyles}
                          value={item.notes}
                          onChange={(event) =>
                            updateItem(index, { notes: event.target.value })
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <StepHeading
                number={3}
                title="Schedule"
                description="Set production dates and workroom notes."
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-ink">
                    Order date
                  </span>
                  <input
                    className={inputStyles}
                    type="date"
                    value={orderDate}
                    onChange={(event) => setOrderDate(event.target.value)}
                  />
                </label>
                <label>
                  <span className="text-sm font-medium text-ink">Due date</span>
                  <input
                    className={inputStyles}
                    type="date"
                    required
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="text-sm font-medium text-ink">
                    Order notes
                  </span>
                  <textarea
                    className={textareaStyles}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            </Card>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-24">
            <Card className="p-5 sm:p-6">
              <StepHeading
                number={4}
                title="Review"
                description="Confirm the brief and financial summary."
              />
              <p className="mt-3 text-sm text-stone-700">
                {selectedCustomerName || "No customer selected"} ·{" "}
                {items.length} garment
                {items.length === 1 ? "" : "s"} · Due{" "}
                {dueDate || "not selected"}
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
                {items.map((item, index) => {
                  const profile = profiles.find(
                    (candidate) => candidate.id === item.measurement_profile_id,
                  );
                  return (
                    <li key={index}>
                      {item.garment_type || "Untitled garment"} ·{" "}
                      {profile ? profile.name : "No measurement profile"}
                    </li>
                  );
                })}
              </ul>
              <label className="mt-5 block max-w-xs">
                <span className="text-sm font-medium text-ink">Discount</span>
                <input
                  className={inputStyles}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                />
              </label>
              <dl className="mt-5 max-w-sm space-y-2 border-t border-stone-200 pt-4 text-sm">
                <MoneyRow
                  label="Subtotal"
                  value={subtotal}
                  currency={currency}
                />
                <MoneyRow
                  label="Discount"
                  value={moneyValue(discountAmount)}
                  currency={currency}
                />
                <MoneyRow
                  label="Total"
                  value={total}
                  currency={currency}
                  strong
                />
              </dl>
            </Card>

            {error ? (
              <p
                className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              className={buttonStyles({ size: "lg", className: "w-full" })}
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create Order
            </button>
          </aside>
        </div>
      </form>
    </PageContainer>
  );
}

function Step({
  icon: Icon,
  number,
  label,
}: {
  icon: typeof UserRound;
  number: number;
  label: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-card">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Step {number}
        </p>
        <p className="text-sm font-semibold text-ink">{label}</p>
      </div>
    </li>
  );
}

function StepHeading({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
        {number}
      </span>
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  currency,
  strong = false,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd>{formatMoney(value, currency)}</dd>
    </div>
  );
}
