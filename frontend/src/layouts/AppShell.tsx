import {
  Calendar as CalendarIcon,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Ruler,
  Settings,
  ShieldCheck,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { AvatarInitials, buttonStyles } from "../components/ui";
import { BusinessLogo } from "../components/BusinessLogo";

const navItems: Array<{
  to: string;
  label: string;
  icon: LucideIcon;
  featureKey?: string;
  matches: (pathname: string) => boolean;
}> = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    matches: (pathname) => pathname === "/dashboard",
  },
  {
    to: "/calendar",
    label: "Calendar",
    icon: CalendarIcon,
    matches: (pathname) => pathname.startsWith("/calendar"),
  },
  {
    to: "/tasks",
    label: "Tasks",
    icon: CheckSquare,
    matches: (pathname) => pathname.startsWith("/tasks"),
  },
  {
    to: "/customers",
    label: "Customers",
    icon: Users,
    featureKey: "customers",
    matches: (pathname) => pathname.startsWith("/customers"),
  },
  {
    to: "/measurements",
    label: "Measurements",
    icon: Ruler,
    featureKey: "measurements",
    matches: (pathname) =>
      pathname.startsWith("/measurements") ||
      pathname.startsWith("/measurement-templates") ||
      pathname.startsWith("/measurement-profiles"),
  },
  {
    to: "/orders",
    label: "Orders",
    icon: ClipboardList,
    featureKey: "orders",
    matches: (pathname) =>
      pathname.startsWith("/orders") || pathname.startsWith("/invoices"),
  },
];

const teamNavItem = {
  to: "/team",
  label: "Team",
  icon: Users,
  matches: (pathname: string) => pathname.startsWith("/team"),
};

const profileNavItem = {
  to: "/profile",
  label: "My Profile",
  icon: User,
  matches: (pathname: string) => pathname.startsWith("/profile"),
};

const settingsNavItem = {
  to: "/settings",
  label: "Settings",
  icon: Settings,
  matches: (pathname: string) => pathname.startsWith("/settings"),
};

const adminNavItem = {
  to: "/admin",
  label: "Super Admin",
  icon: ShieldCheck,
  matches: (pathname: string) => pathname.startsWith("/admin"),
};

function pageContext(pathname: string): string {
  if (pathname.startsWith("/customers")) {
    return "Customers";
  }
  if (
    pathname.startsWith("/measurements") ||
    pathname.startsWith("/measurement-templates") ||
    pathname.startsWith("/measurement-profiles")
  ) {
    return "Measurements";
  }
  if (pathname.startsWith("/orders") || pathname.startsWith("/invoices")) {
    return "Orders";
  }
  if (pathname.startsWith("/settings")) {
    return "Settings";
  }
  if (pathname.startsWith("/profile")) {
    return "Profile";
  }
  if (pathname.startsWith("/team")) {
    return "Team";
  }
  if (pathname.startsWith("/admin")) {
    return "Super Admin";
  }
  return "Dashboard";
}

export function AppShell() {
  const { business, user, logout } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [mobileOpen]);

  const userName = [user?.first_name, user?.last_name]
    .filter(Boolean)
    .join(" ");
  const context = pageContext(location.pathname);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-white lg:flex">
        <SidebarContent
          businessName={business?.name ?? "Fashion business"}
          logoUrl={business?.logo_url}
          pathname={location.pathname}
          userName={userName}
          userRole={user?.role}
          onLogout={() => void logout()}
        />
      </aside>

      <header className="app-topbar sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6 lg:ml-64 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            ref={menuButtonRef}
            className={buttonStyles({
              variant: "ghost",
              size: "sm",
              className: "h-10 w-10 px-0 lg:hidden",
            })}
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted sm:inline">Workspace</span>
            <ChevronRight
              className="hidden h-4 w-4 text-stone-400 sm:block"
              aria-hidden="true"
            />
            <span className="truncate font-semibold text-ink">{context}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            title="View My Profile"
          >
            <div className="hidden text-right sm:block">
              <p className="max-w-44 truncate text-sm font-semibold text-ink">
                {business?.name}
              </p>
              <p className="max-w-44 truncate text-xs text-muted">{userName}</p>
            </div>
            <AvatarInitials name={userName} size="sm" />
          </Link>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            className="absolute inset-0 bg-slate-950/45"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative flex h-full w-[min(86vw,320px)] flex-col bg-sidebar text-white shadow-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <button
              className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-emerald-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              type="button"
              aria-label="Close navigation menu"
              autoFocus
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <SidebarContent
              businessName={business?.name ?? "Fashion business"}
              logoUrl={business?.logo_url}
              pathname={location.pathname}
              userName={userName}
              userRole={user?.role}
              onLogout={() => void logout()}
            />
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 lg:ml-64">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarContent({
  businessName,
  logoUrl,
  pathname,
  userName,
  userRole,
  onLogout,
}: {
  businessName: string;
  logoUrl?: string | null;
  pathname: string;
  userName: string;
  userRole?: string;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="border-b border-white/10 px-5 py-6">
        <Link
          className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          to="/dashboard"
        >
          <BusinessLogo name={businessName} logoUrl={logoUrl} />
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight">FashionOS</p>
            <p
              className="truncate text-xs text-emerald-100/70"
              title={businessName}
            >
              {businessName}
            </p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Main navigation">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/55">
          Workroom
        </p>
        {navItems.map((item) => {
          const active = item.matches(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                active
                  ? "bg-white/12 text-white"
                  : "text-emerald-50/75 hover:bg-white/7 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
        <div className="mt-6 border-t border-white/10 pt-4 space-y-1">
          <SidebarLink item={teamNavItem} pathname={pathname} />
          <SidebarLink item={profileNavItem} pathname={pathname} />
          <SidebarLink item={settingsNavItem} pathname={pathname} />
          {userRole === "SUPER_ADMIN" ? (
            <SidebarLink item={adminNavItem} pathname={pathname} />
          ) : null}
        </div>
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-3">
          <AvatarInitials name={userName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="truncate text-xs text-emerald-100/60">Signed in</p>
          </div>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-emerald-50/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}

function SidebarLink({
  item,
  pathname,
}: {
  item: (typeof navItems)[number];
  pathname: string;
}) {
  const active = item.matches(pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
        active
          ? "bg-white/12 text-white"
          : "text-emerald-50/75 hover:bg-white/7 hover:text-white"
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {item.label}
    </Link>
  );
}
