import type { Metadata } from "next";
import "./globals.css";
import AppSidebarLayout from "@/components/AppSidebarLayout";

export const metadata: Metadata = {
  title: "Enging & Dynamox | Google Workspace Backup & M365 Migration Hub",
  description: "Plataforma interna para inventário, backup do Google Workspace e migração para Microsoft 365",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body className="bg-slate-100 text-slate-800 min-h-screen antialiased flex font-sans selection:bg-[#e95c0c] selection:text-white">
        <AppSidebarLayout>{children}</AppSidebarLayout>
      </body>
    </html>
  );
}
