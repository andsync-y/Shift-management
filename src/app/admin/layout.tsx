import { requireAdmin } from "@/lib/auth";
import NavBar, { type NavGroup } from "@/components/NavBar";

const ITEMS = [{ href: "/admin", label: "ダッシュボード" }];

const GROUPS: NavGroup[] = [
  {
    label: "運営",
    items: [
      { href: "/admin/staff", label: "スタッフ管理" },
      { href: "/admin/shifts", label: "シフト作成" },
      { href: "/admin/requests", label: "休み希望" },
      { href: "/admin/timecards", label: "勤怠管理" },
      { href: "/admin/timecards/fc-export", label: "FC本部 転記" },
      { href: "/admin/payroll", label: "給与計算" },
      { href: "/admin/documents", label: "店舗書類" },
      { href: "/admin/kpi", label: "店舗KPI" },
      { href: "/admin/blackouts", label: "個別予定" },
      { href: "/admin/preopen", label: "プレオープン" },
    ],
  },
  {
    label: "経理",
    items: [
      { href: "/admin/accounting", label: "月次P&L" },
      { href: "/admin/accounting/sales", label: "売上入力" },
      { href: "/admin/accounting/cards", label: "カード明細" },
      { href: "/admin/accounting/receipts", label: "領収書" },
      { href: "/admin/accounting/report", label: "科目別集計" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();
  return (
    <div className="min-h-screen">
      <NavBar profile={profile} items={ITEMS} groups={GROUPS} />
      <main>{children}</main>
    </div>
  );
}
