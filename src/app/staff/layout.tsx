import { requireUser } from "@/lib/auth";
import NavBar from "@/components/NavBar";

// スタッフが利用できるのは「シフト確認」と「お休み希望」のみ。
const NAV = [
  { href: "/staff", label: "シフト確認" },
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
      <main>{children}</main>
    </div>
  );
}
