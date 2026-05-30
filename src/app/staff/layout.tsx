import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";

const NAV = [
  { href: "/staff", label: "シフト確認" },
  { href: "/staff/availability", label: "希望シフト" },
  { href: "/staff/requests", label: "お休み希望" },
];

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireUser();
  return (
    <div className="min-h-screen">
      <NavBar profile={profile} items={NAV} />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
