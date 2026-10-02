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
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('migrate_hub_theme');
                  if (saved === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-slate-100 dark:bg-[#0d131a] text-slate-800 dark:text-slate-100 min-h-screen antialiased flex font-sans selection:bg-[#e95c0c] selection:text-white transition-colors duration-200">
        <AppSidebarLayout>{children}</AppSidebarLayout>
      </body>
    </html>
  );
}
