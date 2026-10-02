"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Users,
  Database,
  MessageSquare,
  Cloud,
  ArrowRightLeft,
  Settings,
  ChevronRight,
  ShieldAlert,
  Layers,
  User,
  RefreshCw,
  Sun,
  Moon,
} from "lucide-react";

interface SubItem {
  href: string;
  label: string;
}

interface PrimaryModule {
  id: string;
  label: string;
  icon: React.ElementType;
  subTitle: string;
  subItems: SubItem[];
}

const MODULES: PrimaryModule[] = [
  {
    id: "dashboard",
    label: "Status",
    icon: Activity,
    subTitle: "PAINEL GERAL",
    subItems: [
      { href: "/", label: "Visão Geral" },
      { href: "/admin/audit", label: "Auditoria" },
    ],
  },
  {
    id: "google",
    label: "Google",
    icon: Users,
    subTitle: "GOOGLE WORKSPACE",
    subItems: [
      { href: "/google/accounts", label: "Contas & Utilizadores" },
      { href: "/google/groups", label: "Grupos de Trabalho" },
    ],
  },
  {
    id: "backups",
    label: "Backups",
    icon: Database,
    subTitle: "VAULT & STORAGE",
    subItems: [
      { href: "/backups", label: "Todos os Backups" },
    ],
  },
  {
    id: "chat",
    label: "Chats",
    icon: MessageSquare,
    subTitle: "ARQUIVO GOOGLE CHAT",
    subItems: [
      { href: "/chat/meus-chats", label: "Meus Chats" },
    ],
  },
  {
    id: "microsoft",
    label: "M365",
    icon: Cloud,
    subTitle: "MICROSOFT 365",
    subItems: [
      { href: "/microsoft/accounts", label: "Contas Microsoft" },
      { href: "/microsoft/mailboxes", label: "Caixas de Correio" },
    ],
  },
  {
    id: "migration",
    label: "Migração",
    icon: ArrowRightLeft,
    subTitle: "FLUXO DE MIGRAÇÃO",
    subItems: [
      { href: "/migration", label: "Google Group → M365" },
    ],
  },
  {
    id: "admin",
    label: "Sistema",
    icon: Settings,
    subTitle: "ADMINISTRAÇÃO",
    subItems: [
      { href: "/admin/integrations", label: "Conexões Cloud" },
      { href: "/admin/users", label: "Utilizadores Internos" },
    ],
  },
];

export default function AppSidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Sync initial theme from document on mount
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const setThemeMode = (mode: "light" | "dark") => {
    setTheme(mode);
    if (mode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("migrate_hub_theme", mode);
    } catch (e) {}
    window.dispatchEvent(new Event("themechange"));
  };

  // Find active module by matching current route
  const activeModule =
    MODULES.find((m) =>
      m.subItems.some((s) => (s.href === "/" ? pathname === "/" : pathname.startsWith(s.href)))
    ) || MODULES[0];

  const [selectedModuleId, setSelectedModuleId] = useState(activeModule.id);
  const currentModule = MODULES.find((m) => m.id === selectedModuleId) || MODULES[0];

  return (
    <div className="flex min-h-screen w-full bg-slate-100 dark:bg-[#0d131a] transition-colors duration-200">
      {/* ------------------------------------------------------------------- */}
      {/* DUAL DARK SIDEBAR                                                   */}
      {/* ------------------------------------------------------------------- */}
      <aside className="fixed inset-y-0 left-0 z-40 flex shadow-2xl select-none">
        {/* 1. Left Primary Icon Column (72px) */}
        <div className="w-[72px] sidebar-primary border-r border-[#192533] flex flex-col justify-between items-center py-4 relative z-20">
          <div className="flex flex-col items-center gap-5 w-full">
            {/* Top Brand Icon */}
            <div className="w-10 h-10 flex items-center justify-center text-[#e95c0c]">
              <Layers className="w-7 h-7 text-[#e95c0c] stroke-[2.5]" />
            </div>

            {/* Primary Nav Tabs */}
            <nav className="w-full space-y-2 pr-0 pl-1.5" aria-label="Navegação Principal">
              {MODULES.map((m) => {
                const Icon = m.icon;
                const isActive = m.id === currentModule.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModuleId(m.id)}
                    className={isActive ? "primary-tab-btn-active" : "primary-tab-btn-inactive"}
                    title={m.label}
                  >
                    <Icon className="w-5 h-5 mb-1" />
                    <span className="text-[14px] tracking-tight font-medium">{m.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Button */}
          <div className="flex flex-col items-center gap-3">
            <button
              title="Utilizador autenticado"
              className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white transition"
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Secondary Submenu Column (215px) */}
        <div className="w-[215px] sidebar-secondary border-r border-[#15202c] flex flex-col justify-between py-4 select-none relative z-10">
          <div className="space-y-3">
            {/* Section Title */}
            <div className="px-4 pt-1 pb-1">
              <h2 className="text-[15px] font-black text-white uppercase tracking-wider">
                {currentModule.subTitle}
              </h2>
            </div>

            {/* Submenu Links List */}
            <nav className="space-y-1">
              {currentModule.subItems.map((s) => {
                const isSubActive = s.href === "/" ? pathname === "/" : pathname.startsWith(s.href);
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={isSubActive ? "submenu-nav-link-active" : "submenu-nav-link-inactive"}
                  >
                    <span>{s.label}</span>
                    {isSubActive && <ChevronRight className="w-3.5 h-3.5 text-white" />}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------------- */}
      {/* MAIN CONTENT AREA                                                   */}
      {/* ------------------------------------------------------------------- */}
      <div className="flex-1 md:pl-[287px] flex flex-col min-h-screen">
        {/* Top Navbar with 4px Solid #e95c0c Orange Border */}
        <header className="top-navbar border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202c] sticky top-0 z-30 px-6 lg:px-10 py-3 flex items-center justify-between gap-4 shadow-xs transition-colors duration-200">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-base tracking-tight text-[#223546] dark:text-white">
              ENGING <span className="text-[#e95c0c] font-black">×</span> DYNAMOX
            </span>
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 font-semibold pl-2 border-l border-slate-200 dark:border-slate-700">
              Workspace Backup & M365 Migration Hub
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark / Light Mode Segmented Control */}
            <div className="flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 shadow-xs">
              <button
                type="button"
                onClick={() => setThemeMode("light")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  theme === "light"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                }`}
                title="Ativar Modo Claro"
              >
                <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500 fill-amber-500/20" : ""}`} />
                <span>Claro</span>
              </button>
              <button
                type="button"
                onClick={() => setThemeMode("dark")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  theme === "dark"
                    ? "bg-[#1c2836] text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                }`}
                title="Ativar Modo Escuro"
              >
                <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-sky-400 fill-sky-400/20" : ""}`} />
                <span>Escuro</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>SISTEMA ATIVO</span>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden md:block">
              andre.gabry@dynamox.net
            </div>
          </div>
        </header>

        {/* Page Children */}
        <main className="flex-1 p-6 lg:p-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
