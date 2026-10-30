"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: IconName;
  managerOnly?: boolean;
  mobile?: boolean; // shown in the bottom bar on phones
}

export const NAV: NavItem[] = [
  { href: "/board", label: "Weekly board", short: "Board", icon: "board", mobile: true },
  { href: "/tasks", label: "All tasks", short: "Tasks", icon: "list", mobile: true },
  { href: "/people", label: "People", icon: "users", mobile: true },
  { href: "/calendar", label: "Calendar", icon: "calendar", mobile: true },
  { href: "/year", label: "Annual overview", icon: "trend" },
  { href: "/meetings", label: "Meetings", icon: "meeting" },
  { href: "/dashboard", label: "Manager dashboard", icon: "chart", managerOnly: true },
  { href: "/admin/team", label: "Team admin", icon: "settings", managerOnly: true },
];

function isActive(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

export function SideNav({ isManager }: { isManager: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.filter((n) => isManager || !n.managerOnly).map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-royal-600 text-white" : "text-royal-100/80 hover:bg-navy-800 hover:text-white"
            }`}
          >
            <Icon name={n.icon} />
            {n.label}
            {n.managerOnly && <Icon name="shield" size={13} className="ml-auto opacity-60" label="Manager only" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const items = NAV.filter((n) => n.mobile);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-800 bg-navy-900 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((n) => {
          const active = isActive(path, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-white" : "text-royal-100/70"}`}
              >
                <Icon name={n.icon} size={20} className={active ? "text-royal-500" : ""} />
                {n.short ?? n.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/more"
            aria-current={path === "/more" ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${path === "/more" ? "text-white" : "text-royal-100/70"}`}
          >
            <Icon name="menu" size={20} />
            More
          </Link>
        </li>
      </ul>
    </nav>
  );
}
