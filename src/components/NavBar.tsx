"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import type { Profile } from "@/lib/types";
import { ROLE_LABELS_JA } from "@/lib/types";

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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/admin" || href === "/staff") return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-bold text-brand">
            全力ストレッチ岐阜長良店
          </Link>
          {/* PC: 横並びナビ */}
          <nav className="hidden gap-1 sm:flex">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  isActive(item.href)
                    ? "bg-brand-light/60 font-medium text-brand"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* PC: 氏名 + ログアウト */}
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-sm text-gray-500">
            {profile.full_name}
            <span className="ml-1 text-xs text-gray-400">
              （{ROLE_LABELS_JA[profile.role]}）
            </span>
          </span>
          <form action={signOut}>
            <button type="submit" className="btn-secondary py-1.5 text-xs">
              ログアウト
            </button>
          </form>
        </div>

        {/* モバイル: ハンバーガーボタン */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 text-gray-600 sm:hidden"
          aria-label="メニュー"
          aria-expanded={open}
        >
          {open ? (
            <span className="text-lg leading-none">✕</span>
          ) : (
            <span className="flex flex-col gap-[3px]">
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
            </span>
          )}
        </button>
      </div>

      {/* モバイル: ドロップダウンメニュー */}
      {open && (
        <div className="border-t border-gray-100 bg-white sm:hidden">
          <div className="mx-auto max-w-6xl px-4 py-2">
            <div className="mb-2 px-1 py-1 text-xs text-gray-400">
              {profile.full_name}（{ROLE_LABELS_JA[profile.role]}）
            </div>
            <nav className="flex flex-col">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm ${
                    isActive(item.href)
                      ? "bg-brand-light/60 font-medium text-brand"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <form action={signOut} className="mt-2 border-t border-gray-100 pt-2">
              <button type="submit" className="btn-secondary w-full py-2 text-sm">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
