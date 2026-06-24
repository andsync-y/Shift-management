"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import type { Profile } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export default function NavBar({
  profile,
  items = [],
  groups = [],
}: {
  profile: Profile;
  items?: NavItem[];
  groups?: NavGroup[];
}) {
  const [open, setOpen] = useState(false); // モバイルメニュー
  const [openGroup, setOpenGroup] = useState<string | null>(null); // PCのドロップダウン
  const pathname = usePathname();
  const roleEn = profile.role === "super_admin" ? "Owner" : "Staff";

  function isActive(href: string) {
    if (href === "/admin" || href === "/staff") return pathname === href;
    return pathname.startsWith(href);
  }
  const groupActive = (g: NavGroup) => g.items.some((i) => isActive(i.href));
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
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""}>
                {item.label}
              </Link>
            ))}
            {groups.map((g) => (
              <div className="nav-grp" key={g.label}>
                <button
                  type="button"
                  className={"nav-grp-btn" + (groupActive(g) ? " active" : "")}
                  onClick={() => setOpenGroup((c) => (c === g.label ? null : g.label))}
                >
                  {g.label} <span className="nav-grp-caret">▾</span>
                </button>
                {openGroup === g.label && (
                  <div className="nav-grp-menu">
                    {g.items.map((i) => (
                      <Link
                        key={i.href}
                        href={i.href}
                        className={isActive(i.href) ? "active" : ""}
                        onClick={() => setOpenGroup(null)}
                      >
                        {i.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
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

      {/* PCドロップダウンの外側クリックで閉じる */}
      {openGroup && <div className="nav-grp-backdrop" onClick={() => setOpenGroup(null)} />}

      {/* モバイルメニュー */}
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
        {groups.map((g) => (
          <div className="mm-group" key={g.label}>
            <div className="mm-group-label">{g.label}</div>
            {g.items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={isActive(i.href) ? "active" : ""}
                onClick={() => setOpen(false)}
              >
                {i.label}
                <span className="arrow muted">→</span>
              </Link>
            ))}
          </div>
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
