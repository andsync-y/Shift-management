import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import type { Profile } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
}

export default function NavBar({
  profile,
  items,
}: {
  profile: Profile;
  items: NavItem[];
}) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-brand">
            全力ストレッチ岐阜長良店
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{profile.full_name} さん</span>
          <form action={signOut}>
            <button type="submit" className="btn-secondary py-1.5 text-xs">
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
