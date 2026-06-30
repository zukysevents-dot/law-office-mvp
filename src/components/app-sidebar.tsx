"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlarmClock,
  BarChart3,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Clock3,
  Archive,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Inbox,
  Users,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  ListTodo,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { ModuleKey } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  // Gate this item behind a bought module (UX only). Items without `module`
  // are always visible (CORE).
  module?: ModuleKey;
  // Skryj, pokud uživatel nemá oprávnění spravovat faktury (ADMIN/PARTNER nebo
  // grant MANAGE_INVOICES). UX-only; akce/stránka gatují server-side.
  requiresInvoiceAccess?: boolean;
};

// Grouped navigation. Sections give the (now 20+) items a hierarchy instead of
// one flat scroll. A section whose items are all hidden (module not bought /
// not admin) is dropped entirely, so the rail never shows an empty header.
type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Přehled",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Spisy",
    items: [
      { href: "/subjects", label: "Subjekty", icon: Building2 },
      { href: "/conflict-check", label: "Conflict check", icon: ShieldCheck },
      {
        href: "/aml",
        label: "AML / KYC",
        icon: ShieldAlert,
        adminOnly: true,
        module: ModuleKey.AML,
      },
      { href: "/projects", label: "Projekty", icon: BriefcaseBusiness },
      { href: "/cases", label: "Případy", icon: FileText },
      {
        href: "/data-boxes",
        label: "Datové schránky",
        icon: Inbox,
        module: ModuleKey.DATA_BOXES,
      },
    ],
  },
  {
    title: "Práce",
    items: [
      { href: "/tasks", label: "Úkoly", icon: ListTodo },
      { href: "/tasks/my", label: "Moje úkoly", icon: ListChecks },
      { href: "/tasks/archive", label: "Archiv úkolů", icon: Archive },
      { href: "/work-logs", label: "Výkazy práce", icon: Clock3 },
      {
        href: "/billing",
        label: "Fakturace",
        icon: Receipt,
        module: ModuleKey.BILLING,
        requiresInvoiceAccess: true,
      },
      { href: "/reports", label: "Reporty", icon: BarChart3 },
      { href: "/references", label: "Reference", icon: LibraryBig },
    ],
  },
  {
    title: "Lhůty & dokumenty",
    items: [
      { href: "/deadlines", label: "Lhůtník", icon: AlarmClock, module: ModuleKey.DEADLINES },
      { href: "/calendar", label: "Kalendář", icon: CalendarDays, module: ModuleKey.DEADLINES },
      { href: "/documents", label: "Dokumenty", icon: FolderOpen, module: ModuleKey.DOCUMENTS },
    ],
  },
  {
    title: "HR",
    items: [
      { href: "/hr/employees", label: "Zaměstnanci", icon: Users, module: ModuleKey.HR_ATTENDANCE },
      { href: "/hr/attendance", label: "Docházka", icon: CalendarClock, module: ModuleKey.HR_ATTENDANCE },
      { href: "/hr/absences", label: "Absence", icon: CalendarOff, module: ModuleKey.HR_ATTENDANCE },
      { href: "/hr/exports", label: "Mzdový export", icon: FileSpreadsheet, module: ModuleKey.HR_ATTENDANCE },
    ],
  },
  {
    title: "Správa",
    items: [
      { href: "/audit-log", label: "Audit log", icon: ScrollText, adminOnly: true },
      { href: "/settings/organization", label: "Kancelář", icon: Briefcase, adminOnly: true },
      { href: "/settings", label: "Nastavení", icon: Settings },
    ],
  },
];

function getActiveHref(pathname: string, items: NavItem[]) {
  const match = items
    .filter((item) => {
      if (item.href === "/dashboard") {
        return pathname === "/dashboard";
      }

      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    })
    .sort((a, b) => b.href.length - a.href.length)[0];

  return match?.href ?? "/dashboard";
}

export function AppSidebar({
  showAuditLog,
  canManageInvoices,
  userName,
  userRole,
  enabledModules,
}: {
  showAuditLog?: boolean;
  canManageInvoices?: boolean;
  userName?: string;
  userRole?: string;
  enabledModules?: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Two independent gates:
  // - showAuditLog === canViewAllLegalData (ADMIN/PARTNER); same gate covers the
  //   org-management link, so adminOnly items hide for everyone else.
  // - enabledModules hides nav items for modules the org hasn't bought. Missing
  //   prop → empty list → module-gated items hidden (fail-closed UX).
  const enabled = enabledModules ?? [];
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.adminOnly && !showAuditLog) return false;
        if (item.module && !enabled.includes(item.module)) return false;
        if (item.requiresInvoiceAccess && !canManageInvoices) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
  const activeHref = getActiveHref(
    pathname,
    visibleSections.flatMap((section) => section.items),
  );

  const accountFooter = (
    <div className="mt-auto border-t border-white/10 pt-3">
      <div className="hidden min-w-0 px-3 pb-2 xl:block">
        <p className="truncate text-sm font-medium text-white">{userName}</p>
        <p className="truncate text-xs text-[#9cc6ad]">{userRole}</p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          title="Odhlásit se"
          className="flex h-11 w-full min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium text-[#d8eee0] transition hover:bg-[#B9DCC6]/15 hover:text-white lg:h-10 lg:w-11 lg:justify-center lg:px-0 xl:w-auto xl:justify-start xl:px-3"
        >
          <LogOut className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" aria-hidden="true" />
          <span className="min-w-0 truncate lg:sr-only xl:not-sr-only">
            Odhlásit se
          </span>
        </button>
      </form>
    </div>
  );

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.href === activeHref;

    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        onClick={() => setOpen(false)}
        className={cn(
          "flex h-11 max-w-full min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition lg:h-10 lg:w-11 lg:justify-center lg:px-0 xl:w-auto xl:justify-start xl:px-3",
          active
            ? "bg-[#B9DCC6] text-[#072924]"
            : "text-[#d8eee0] hover:bg-[#B9DCC6]/15 hover:text-white",
        )}
      >
        <Icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" aria-hidden="true" />
        <span className="min-w-0 truncate lg:sr-only xl:not-sr-only">
          {item.label}
        </span>
      </Link>
    );
  };

  // One render reused by the mobile drawer and the desktop rail. Section headers
  // show at full width (mobile + xl); on the collapsed lg rail they're hidden
  // and the top border alone separates the icon groups.
  const navContent = visibleSections.map((section, index) => (
    <div
      key={section.title}
      className={cn(
        "flex w-full flex-col gap-1 items-stretch lg:items-center xl:items-stretch",
        index > 0 && "mt-1 border-t border-white/10 pt-2",
      )}
    >
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#9cc6ad] lg:hidden xl:block">
        {section.title}
      </p>
      {section.items.map(renderLink)}
    </div>
  ));

  return (
    <aside className="w-full max-w-full shrink-0 overflow-x-hidden bg-[#072924] text-white lg:min-h-screen lg:w-20 lg:self-stretch lg:overflow-visible xl:w-72">
      {/* Mobile top bar (fixed) — hidden from lg up where the rail takes over. */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between gap-3 bg-[#072924] px-4 lg:hidden">
        <Link
          href="/dashboard"
          className="block min-w-0 overflow-hidden"
          aria-label="syndikat.legal"
        >
          <Image
            src="/brand/logo-square.jpeg"
            alt="syndikat.legal"
            width={220}
            height={220}
            priority
            className="h-10 w-10 rounded-md object-cover"
          />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Zavřít menu" : "Otevřít menu"}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[#d8eee0] transition hover:bg-[#B9DCC6]/15 hover:text-white"
        >
          {open ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      </div>
      {/* Spacer so page content clears the fixed mobile bar. */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
      {/* Mobile drawer — full-height panel below the bar, only when open. */}
      {open ? (
        <nav
          id="mobile-nav"
          className="fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col gap-1 overflow-y-auto border-t border-white/10 bg-[#072924] p-3 lg:hidden"
        >
          {navContent}
          {accountFooter}
        </nav>
      ) : null}

      {/* Desktop rail — unchanged from lg up. */}
      <div className="hidden lg:fixed lg:top-0 lg:flex lg:h-screen lg:w-20 lg:flex-col xl:w-72">
        <div className="flex h-20 min-w-0 items-center border-b border-white/10 px-4 xl:px-5">
          <Link
            href="/dashboard"
            className="block min-w-0 max-w-full overflow-hidden"
            aria-label="syndikat.legal"
          >
            <Image
              src="/brand/logo-light.jpeg"
              alt="syndikat.legal"
              width={520}
              height={165}
              priority
              className="hidden h-auto max-h-12 w-full max-w-52 object-contain object-left xl:block"
            />
            <Image
              src="/brand/logo-square.jpeg"
              alt="syndikat.legal"
              width={220}
              height={220}
              priority
              className="h-11 w-11 rounded-md object-cover xl:hidden"
            />
          </Link>
        </div>
        <nav className="flex min-w-0 flex-1 flex-col flex-nowrap items-center gap-2 overflow-x-hidden overflow-y-auto p-3 xl:items-stretch">
          {navContent}
          {accountFooter}
        </nav>
      </div>
    </aside>
  );
}
