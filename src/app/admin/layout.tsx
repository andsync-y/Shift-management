import { requireAdmin } from "@/lib/auth";
import NavBar from "@/components/NavBar";

const NAV = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/staff", label: "スタッフ管理" },
  { href: "/admin/shifts", label: "シフト作成" },
  { href: "/admin/requests", label: "休み希望" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();
  return (
    <div className="min-h-screen">
      <NavBar profile={profile} items={NAV} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
