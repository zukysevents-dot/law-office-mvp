"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  Archive,
  FileText,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  ListTodo,
  ScrollText,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/subjects", label: "Subjekty", icon: Building2 },
  { href: "/conflict-check", label: "Conflict check", icon: ShieldCheck },
  { href: "/projects", label: "Projekty", icon: BriefcaseBusiness },
  { href: "/cases", label: "Případy", icon: FileText },
  { href: "/tasks", label: "Úkoly", icon: ListTodo },
  { href: "/tasks/my", label: "Moje úkoly", icon: ListChecks },
  { href: "/tasks/archive", label: "Archiv úkolů", icon: Archive },
  { href: "/work-logs", label: "Výkazy práce", icon: Clock3 },
  { href: "/references", label: "Reference", icon: LibraryBig },
  { href: "/calendar", label: "Kalendář", icon: CalendarDays },
  { href: "/audit-log", label: "Audit log", icon: ScrollText },
  { href: "/settings", label: "Nastavení", icon: Settings },
];

function getActiveHref(pathname: string, items: typeof navItems) {
  const match = items
    .filter((item) => {
      if (item.href === "/") {
        return pathname === "/";
      }

      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    })
    .sort((a, b) => b.href.length - a.href.length)[0];

  return match?.href ?? "/";
}

export function AppSidebar({ showAuditLog }: { showAuditLog?: boolean }) {
  const pathname = usePathname();
  const visibleNavItems = showAuditLog
    ? navItems
    : navItems.filter((item) => item.href !== "/audit-log");
  const activeHref = getActiveHref(pathname, visibleNavItems);

  return (
    <aside className="w-full max-w-full shrink-0 overflow-x-hidden bg-[#072924] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-20 lg:flex-col xl:w-72">
      <div className="flex h-20 min-w-0 items-center border-b border-white/10 px-4 xl:px-5">
        <Link
          href="/"
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
      <nav className="flex max-w-full flex-wrap gap-2 overflow-x-hidden border-b border-white/10 p-3 lg:min-w-0 lg:flex-1 lg:flex-col lg:flex-nowrap lg:items-center lg:overflow-x-hidden lg:overflow-y-auto lg:border-b-0 xl:items-stretch">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === activeHref;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex h-10 max-w-full min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition lg:w-11 lg:justify-center lg:px-0 xl:w-auto xl:justify-start xl:px-3",
                active
                  ? "bg-[#B9DCC6] text-[#072924]"
                  : "text-[#d8eee0] hover:bg-[#B9DCC6]/15 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate lg:sr-only xl:not-sr-only">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
