import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Fab } from "@/components/Fab";
import { BottomNav, SideNav } from "@/components/NavLinks";
import { Avatar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { memberName } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop / tablet-landscape sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 px-4 py-5 lg:flex">
        <Link href="/board" className="mb-8 flex items-center gap-3 px-2 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-royal-600">
            <Icon name="board" size={20} />
          </span>
          <span className="leading-tight">
            <span className="block text-[11px] font-semibold tracking-widest text-royal-100/70 uppercase">Agency</span>
            <span className="block font-bold">Weekly Task Planner</span>
          </span>
        </Link>
        <SideNav isManager={user.isManager} />
        <div className="mt-auto border-t border-navy-800 pt-4">
          <div className="flex items-center gap-3 px-2">
            <Avatar member={user.member} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">{memberName(user.member)}</div>
              <div className="text-xs text-royal-100/70">{user.isManager ? "Manager" : "Team member"}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2 px-2">
            <Link href="/set-password" className="text-xs text-royal-100/70 hover:text-white">
              Change password
            </Link>
            <form action="/auth/signout" method="post" className="ml-auto">
              <button className="flex items-center gap-1 text-xs text-royal-100/70 hover:text-white">
                <Icon name="logout" size={14} /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Phone / tablet top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-navy-900 px-4 py-3 text-white lg:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-royal-600">
          <Icon name="board" size={18} />
        </span>
        <span className="font-bold">Weekly Task Planner</span>
        <span className="ml-auto">
          <Avatar member={user.member} size="sm" />
        </span>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      {user.isManager && <Fab />}
      <BottomNav />
    </div>
  );
}
