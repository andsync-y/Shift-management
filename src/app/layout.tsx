import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "全力ストレッチ岐阜長良店 シフト管理",
  description: "スタッフ管理・AIシフト自動作成・お休み希望申請",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
