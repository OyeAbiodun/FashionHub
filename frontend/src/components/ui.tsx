import type { LucideIcon } from "lucide-react";
/* eslint-disable react-refresh/only-export-components -- shared UI primitives intentionally expose style helpers */
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Inbox,
  Loader2,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type ButtonVariant =
  "primary" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "default" | "lg";

export function buttonStyles({
  variant = "primary",
  size = "default",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  const variants: Record<ButtonVariant, string> = {
    primary: "border-primary bg-primary text-white hover:bg-primary-hover",
    secondary:
      "border-primary-soft bg-primary-soft text-primary hover:bg-emerald-100",
    outline:
      "border-border bg-white text-ink hover:border-stone-300 hover:bg-stone-50",
    ghost:
      "border-transparent bg-transparent text-muted hover:bg-stone-100 hover:text-ink",
    destructive: "border-danger bg-danger text-white hover:bg-red-800",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "h-9 px-3 text-sm",
    default: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-base",
  };
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  ].join(" ");
}

export function Button({
  variant,
  size,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonStyles({ variant, size, className })} {...props}>
      {children}
    </button>
  );
}

export const inputStyles =
  "mt-2 h-11 w-full rounded-lg border border-border bg-white px-3 text-ink shadow-sm outline-none transition placeholder:text-stone-400 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500";
export const textareaStyles = `${inputStyles} h-auto min-h-28 py-3`;
export const labelStyles = "text-sm font-medium text-ink";
export const helpTextStyles = "mt-1.5 text-sm leading-5 text-muted";
export const errorTextStyles = "mt-1.5 text-sm font-medium text-danger";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = "", ...props }, ref) {
  return (
    <input ref={ref} className={`${inputStyles} ${className}`} {...props} />
  );
});

export function PageContainer({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 sm:py-8 xl:px-8 ${className}`}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            {description}
          </p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`rounded-xl border border-border bg-white shadow-card ${className}`}
      {...props}
    />
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-ink sm:text-lg">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const statusTone: Record<string, string> = {
  DRAFT: "border-stone-200 bg-stone-100 text-stone-700",
  CONFIRMED: "border-blue-200 bg-blue-50 text-blue-700",
  CUTTING: "border-violet-200 bg-violet-50 text-violet-700",
  SEWING: "border-sky-200 bg-sky-50 text-sky-700",
  FITTING: "border-indigo-200 bg-indigo-50 text-indigo-700",
  FINISHING: "border-amber-200 bg-amber-50 text-amber-800",
  READY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  DELIVERED: "border-green-200 bg-green-50 text-green-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  SUCCESSFUL: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  REFUNDED: "border-stone-200 bg-stone-100 text-stone-700",
  ISSUED: "border-blue-200 bg-blue-50 text-blue-700",
  PARTIALLY_PAID: "border-amber-200 bg-amber-50 text-amber-800",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
  OVERDUE: "border-red-200 bg-red-50 text-red-700",
  ARCHIVED: "border-stone-200 bg-stone-100 text-stone-700",
  HIGH: "border-red-200 bg-red-50 text-red-700",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800",
  INFO: "border-blue-200 bg-blue-50 text-blue-700",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone[status] ?? statusTone.DRAFT}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function AvatarInitials({
  name,
  size = "default",
}: {
  name: string;
  size?: "sm" | "default" | "lg";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const sizes = {
    sm: "h-9 w-9 text-xs",
    default: "h-11 w-11 text-sm",
    lg: "h-16 w-16 text-lg",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary ${sizes[size]}`}
      aria-hidden="true"
    >
      {initials || "FO"}
    </span>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? "px-4 py-7" : "px-5 py-12"}`}>
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function InlineError({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">{message}</p>
          {retry ? (
            <button
              className="mt-2 font-semibold underline underline-offset-4"
              type="button"
              onClick={retry}
            >
              Try Again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
      role="status"
    >
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-stone-200/80 ${className}`} />
  );
}

export function LoadingBlock({
  label = "Loading content",
}: {
  label?: string;
}) {
  return (
    <div className="space-y-3" aria-label={label}>
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  danger = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel
      ?.querySelector<HTMLElement>("button, input, select, textarea, a[href]")
      ?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousBodyOverflow;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        ref={panelRef}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-dialog sm:max-w-lg sm:rounded-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p
                id={descriptionId}
                className="mt-2 text-sm leading-6 text-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
          <button
            className={buttonStyles({
              variant: "ghost",
              size: "sm",
              className: "h-9 w-9 px-0",
            })}
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {danger ? (
          <div className="mt-5 flex gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <Archive className="h-5 w-5 shrink-0" aria-hidden="true" />
            This action preserves the record but removes it from active work.
          </div>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
        {footer ? (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SpinnerLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {children}
    </span>
  );
}
