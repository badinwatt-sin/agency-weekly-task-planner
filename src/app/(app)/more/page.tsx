import Link from "next/link";
import { Icon } from "@/components/Icon";
import { NAV } from "@/components/NavLinks";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "More" };

export default async function MorePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="More" />
      <ul className="card divide-y divide-line">
        {NAV.filter((n) => user.isManager || !n.managerOnly).map((n) => (
          <li key={n.href}>
            <Link href={n.href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-royal-50">
              <Icon name={n.icon} className="text-royal-600" />
              {n.label}
              <Icon name="right" size={16} className="ml-auto text-muted" />
            </Link>
          </li>
        ))}
        <li>
          <Link href="/set-password" className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-royal-50">
            <Icon name="lock" className="text-royal-600" />
            Change password
          </Link>
        </li>
        <li>
          <form action="/auth/signout" method="post">
            <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-red-700 hover:bg-red-50">
              <Icon name="logout" /> Sign out
            </button>
          </form>
        </li>
      </ul>
    </>
  );
}
