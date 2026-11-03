import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppSidebarLayout from "@/components/AppSidebarLayout";
import PageLoadingOverlay from "@/components/PageLoadingOverlay";

const titillium = localFont({
  src: [
    {
      path: "../fonts/Titillium-Thin.otf",
      weight: "100",
      style: "normal",
    },
    {
      path: "../fonts/Titillium-ThinItalic.otf",
      weight: "100",
      style: "italic",
    },
    {
      path: "../fonts/Titillium-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/Titillium-LightItalic.otf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../fonts/Titillium-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/Titillium-RegularItalic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../fonts/Titillium-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/Titillium-SemiboldItalic.otf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../fonts/Titillium-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../fonts/Titillium-BoldItalic.otf",
      weight: "700",
      style: "italic",
    },
    {
      path: "../fonts/Titillium-Black.otf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-titillium",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
});

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
    <html lang="pt-PT" className={`${titillium.variable} ${titillium.className}`} suppressHydrationWarning>
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
      <body className={`${titillium.className} bg-slate-100 dark:bg-[#0d131a] text-slate-800 dark:text-slate-100 min-h-screen antialiased flex font-sans selection:bg-[#e95c0c] selection:text-white transition-colors duration-200`}>
        <PageLoadingOverlay />
        <AppSidebarLayout>{children}</AppSidebarLayout>
      </body>
    </html>
  );
}
