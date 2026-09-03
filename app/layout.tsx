import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINKPROBE - VPN 线路检测",
  description: "实时检测 VPN 线路可用性与响应延迟，自动推荐当前网络下的最快访问节点。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
