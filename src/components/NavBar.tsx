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
  const roleEn = profile.role === "super_admin" ? "Owner" : "Staff";

  function isActive(href: string) {
    if (href === "/admin" || href === "/staff") return pathname === href;
    return pathname.startsWith(href);
  }

  const home = profile.role === "super_admin" ? "/admin" : "/staff";

  return (
    <>
      <header className="appbar">
        <div className="appbar-inner">
          <Link href={home} className="brand">
            <span className="mark">全力ストレッチ岐阜長良店</span>
          </Link>

          <nav className="nav">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "active" : ""}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="appbar-right">
            <span className="who">
              <b>{profile.full_name}</b>
              <span className="role-label">{roleEn}</span>
            </span>
            <form action={signOut}>
              <button type="submit" className="btn-link ink">
                ログアウト
              </button>
            </form>
          </div>

          <button
            className="hamburger"
            aria-label="メニュー"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span style={open ? { transform: "translateY(6.5px) rotate(45deg)" } : {}} />
            <span style={open ? { opacity: 0 } : {}} />
            <span style={open ? { transform: "translateY(-6.5px) rotate(-45deg)" } : {}} />
          </button>
        </div>
      </header>

      {/* モバイルメニュー（appbarの外に置く: backdrop-filter下では fixed が効かないため） */}
      <div className={"mobile-menu" + (open ? " open" : "")}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? "active" : ""}
            onClick={() => setOpen(false)}
          >
            {item.label}
            <span className="arrow muted">→</span>
          </Link>
        ))}
        <div className="mm-who">
          <span>
            {profile.full_name}
            <span className="role-label" style={{ marginLeft: 8 }}>
              {roleEn}
            </span>
          </span>
          <form action={signOut}>
            <button type="submit" className="btn-link ink">
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
