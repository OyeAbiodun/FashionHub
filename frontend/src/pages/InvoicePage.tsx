import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { useInvoice } from "../hooks/useInvoices";
import { formatMoney } from "../lib/money";
import { formatStatus } from "../lib/orders";
import { formatDate } from "../lib/date";
import {
  InlineError,
  PageContainer,
  Skeleton,
  StatusBadge,
  buttonStyles,
} from "../components/ui";
import { BusinessLogo } from "../components/BusinessLogo";

export function InvoicePage() {
  const { invoiceId } = useParams();
  const invoiceQuery = useInvoice(invoiceId);
  const invoice = invoiceQuery.data;

  if (invoiceQuery.isLoading) {
    return (
      <PageContainer className="max-w-6xl">
        <Skeleton className="h-[680px]" />
      </PageContainer>
    );
  }
  if (invoiceQuery.isError || !invoice) {
    return (
      <PageContainer className="max-w-6xl">
        <InlineError message="Invoice not found." />
      </PageContainer>
    );
  }

  const currency = invoice.business.currency || "NGN";
  return (
    <section className="invoice-page mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          to={`/orders/${invoice.order.id}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to order
        </Link>
        <button
          className={buttonStyles()}
          type="button"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Print Invoice
        </button>
      </div>

      <article className="invoice-document rounded-xl border border-border bg-white p-6 shadow-card sm:p-10 lg:p-12">
        <header className="flex flex-col justify-between gap-8 border-b-2 border-ink pb-8 sm:flex-row">
          <div>
            <BusinessLogo
              className="mb-3 h-16 w-16 border border-border"
              name={invoice.business.name}
              logoUrl={invoice.business.logo_url}
            />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Fashion business
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {invoice.business.name}
            </h1>
            <ContactLines
              values={[
                invoice.business.address,
                invoice.business.phone,
                invoice.business.email,
              ]}
            />
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Invoice
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {invoice.invoice_number}
            </h2>
            <div className="mt-3 flex justify-start sm:justify-end">
              <StatusBadge
                status={invoice.status}
                label={formatStatus(invoice.status)}
              />
            </div>
            <p className="mt-3 text-sm text-muted">
              Issued: {formatDate(invoice.issued_at, invoice.business.timezone)}
            </p>
            {invoice.due_date ? (
              <p className="text-sm">Due: {formatDate(invoice.due_date)}</p>
            ) : null}
          </div>
        </header>

        <div className="grid gap-8 border-b border-border py-8 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Bill to
            </p>
            <p className="mt-2 font-semibold">{invoice.customer.name}</p>
            <ContactLines
              values={[
                invoice.customer.address,
                invoice.customer.phone,
                invoice.customer.email,
              ]}
            />
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Order
            </p>
            <p className="mt-2 font-semibold">{invoice.order.order_number}</p>
            <p className="text-sm text-stone-600">
              Order date: {formatDate(invoice.order.order_date)}
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink bg-stone-50 text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-3">Description</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Price</th>
                <th className="px-3 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr
                  className="border-b border-stone-100"
                  key={`${item.garment_type}-${index}`}
                >
                  <td className="px-3 py-4">
                    <strong>{item.garment_type}</strong>
                    {item.description ? (
                      <span className="mt-1 block text-stone-600">
                        {item.description}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-4 text-right">{item.quantity}</td>
                  <td className="px-3 py-4 text-right">
                    {formatMoney(item.unit_price, currency)}
                  </td>
                  <td className="px-3 py-4 text-right font-medium">
                    {formatMoney(item.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-8 max-w-sm space-y-3 rounded-xl bg-stone-50 p-5 text-sm">
          <SummaryRow
            label="Subtotal"
            value={formatMoney(invoice.financial_summary.subtotal, currency)}
          />
          <SummaryRow
            label="Discount"
            value={formatMoney(
              invoice.financial_summary.discount_amount,
              currency,
            )}
          />
          <SummaryRow
            label="Total"
            value={formatMoney(invoice.financial_summary.total, currency)}
            strong
          />
          <SummaryRow
            label="Amount Paid"
            value={formatMoney(invoice.financial_summary.amount_paid, currency)}
          />
          <SummaryRow
            label="Balance Due"
            value={formatMoney(
              invoice.financial_summary.outstanding_balance,
              currency,
            )}
            strong
          />
        </dl>
        {invoice.notes ? (
          <div className="mt-8 border-t border-stone-200 pt-5">
            <h4 className="font-semibold">Notes</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
              {invoice.notes}
            </p>
          </div>
        ) : null}
        {invoice.business.invoice_notes ? (
          <div className="mt-6 border-t border-stone-200 pt-5">
            <h4 className="font-semibold">Payment information</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
              {invoice.business.invoice_notes}
            </p>
          </div>
        ) : null}
        {invoice.business.invoice_footer ? (
          <footer className="mt-8 border-t border-stone-200 pt-5 text-center text-sm text-stone-500 whitespace-pre-wrap">
            {invoice.business.invoice_footer}
          </footer>
        ) : null}
      </article>
    </section>
  );
}

function ContactLines({ values }: { values: (string | null)[] }) {
  return (
    <div className="mt-2 text-sm text-stone-600">
      {values.filter(Boolean).map((value) => (
        <p key={value}>{value}</p>
      ))}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-5 ${strong ? "border-t border-stone-200 pt-2 text-base font-semibold" : ""}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
