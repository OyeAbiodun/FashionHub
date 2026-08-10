import { CheckCircle2, Scissors } from "lucide-react";
import { ReactNode } from "react";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-canvas p-3 sm:p-5">
      <section className="mx-auto grid min-h-[calc(100vh-1.5rem)] w-full max-w-screen-2xl overflow-hidden rounded-2xl border border-border bg-white shadow-card sm:min-h-[calc(100vh-2.5rem)] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden bg-sidebar p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sidebar">
                <Scissors className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-xl font-semibold tracking-tight">
                FashionOS
              </span>
            </div>
            <p className="mt-20 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
              Built for the workroom
            </p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Run every client, garment, and payment from one clear place.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/70">
              A calm operating system for fashion designers and tailoring
              businesses ready to move beyond notebooks and scattered chats.
            </p>
          </div>
          <ul className="space-y-3 text-sm text-emerald-50/80">
            {[
              "Customer records and measurement history",
              "Production tracking from confirmation to delivery",
              "Pricing, payments, and professional invoices",
            ].map((item) => (
              <li className="flex items-center gap-3" key={item}>
                <CheckCircle2
                  className="h-4 w-4 text-emerald-300"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center px-5 py-8 sm:px-10 lg:px-12 xl:px-20">
          <div className="mx-auto w-full max-w-xl">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Scissors className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-lg font-semibold text-ink">FashionOS</span>
            </div>
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
