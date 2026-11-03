"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  LogOut,
  KeyRound,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import MsglAuth from "@/components/MsglAuth";
import { AppSwal, toast, dialog, showLoading, hideLoading } from "@/lib/swal";

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
      { href: "/admin/email", label: "Servidor de E-mail" },
      { href: "/admin/users", label: "Utilizadores Internos" },
    ],
  },
];

export default function AppSidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sessionUser, setSessionUser] = useState<any | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // Find active module by matching current route
  const activeModule =
    MODULES.find((m) =>
      m.subItems.some((s) => (s.href === "/" ? pathname === "/" : pathname.startsWith(s.href)))
    ) || MODULES[0];

  const [selectedModuleId, setSelectedModuleId] = useState(activeModule.id);

  // Keep selectedModuleId updated when route changes
  useEffect(() => {
    setSelectedModuleId(activeModule.id);
  }, [activeModule.id]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync initial theme from document on mount
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");

    // If accessing googlechat.enging.pt at root, direct to the chat portal
    if (typeof window !== "undefined" && window.location.hostname === "googlechat.enging.pt") {
      if (!pathname.startsWith("/portal/chat") && !pathname.startsWith("/api")) {
        window.location.replace("/portal/chat");
        return;
      }
    }

    setSessionLoading(true);
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then(async (d) => {
        if (d?.user) {
          // If in simulation mode, auto-restore the administrator session to break any stuck redirect loops
          if (d.user.isSimulated) {
            try {
              const resExit = await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ exitSimulation: true }),
              });
              const dataExit = await resExit.json();
              if (dataExit?.user) {
                setSessionUser(dataExit.user);
                return;
              }
            } catch (err) {
              console.error("Falha ao restaurar sessão:", err);
            }
          }
          setSessionUser(d.user);
        } else {
          setSessionUser(null);
        }
      })
      .catch((e) => {
        console.error(e);
        setSessionUser(null);
      })
      .finally(() => {
        setSessionLoading(false);
      });
  }, [pathname]);

  const handleExitSimulation = async () => {
    try {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitSimulation: true }),
      });
      window.location.href = "/";
    } catch (e) {
      window.location.reload();
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      setSessionUser(null);
    } catch (e) {
      setSessionUser(null);
    }
  };

  const [isOwnPasswordModalOpen, setIsOwnPasswordModalOpen] = useState(false);
  const [ownCurrentPassword, setOwnCurrentPassword] = useState("");
  const [ownNewPassword, setOwnNewPassword] = useState("");
  const [ownConfirmPassword, setOwnConfirmPassword] = useState("");
  const [ownShowCurrent, setOwnShowCurrent] = useState(false);
  const [ownShowNew, setOwnShowNew] = useState(false);
  const [ownShowConfirm, setOwnShowConfirm] = useState(false);
  const [ownPasswordError, setOwnPasswordError] = useState("");
  const [ownPasswordSuccess, setOwnPasswordSuccess] = useState("");
  const [ownPasswordSubmitting, setOwnPasswordSubmitting] = useState(false);

  const handleOpenChangeOwnPassword = () => {
    setOwnCurrentPassword("");
    setOwnNewPassword("");
    setOwnConfirmPassword("");
    setOwnPasswordError("");
    setOwnPasswordSuccess("");
    setOwnShowCurrent(false);
    setOwnShowNew(false);
    setOwnShowConfirm(false);
    setIsOwnPasswordModalOpen(true);
  };

  const handleSubmitOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnPasswordError("");
    setOwnPasswordSuccess("");

    if (!ownCurrentPassword) {
      setOwnPasswordError("Por favor informe a sua palavra-passe atual.");
      return;
    }
    if (!ownNewPassword || ownNewPassword.length < 6) {
      setOwnPasswordError("A nova palavra-passe deve conter pelo menos 6 caracteres.");
      return;
    }
    if (ownNewPassword !== ownConfirmPassword) {
      setOwnPasswordError("A confirmação da nova palavra-passe não coincide.");
      return;
    }

    setOwnPasswordSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: sessionUser?.email,
          currentPassword: ownCurrentPassword,
          newPassword: ownNewPassword,
          confirmPassword: ownConfirmPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOwnPasswordSuccess("Palavra-passe alterada com sucesso!");
        toast.success("Palavra-passe Alterada!", "A sua nova palavra-passe está ativa.");
        setTimeout(() => {
          setIsOwnPasswordModalOpen(false);
        }, 1200);
      } else {
        setOwnPasswordError(data.error || "Não foi possível atualizar a palavra-passe.");
      }
    } catch (err: any) {
      setOwnPasswordError(err.message || "Erro inesperado de ligação.");
    } finally {
      setOwnPasswordSubmitting(false);
    }
  };

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

  // If on /portal/chat or if the user is a chat-only user, bypass the dual admin sidebar completely
  if (pathname.startsWith("/portal/chat")) {
    return <div className="min-h-screen w-full">{children}</div>;
  }

  // If session is still loading
  if (sessionLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#e95c0c] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium">A validar credenciais de gestor...</p>
        </div>
      </div>
    );
  }

  // If not authenticated or not gestor on MSGL, render dedicated MSGL Gestor login screen
  const isGestorUser =
    sessionUser?.isGestor ||
    ["ADMIN", "BACKUP_OPERATOR", "MIGRATION_OPERATOR", "AUDITOR"].includes(sessionUser?.role || "");

  if (!sessionUser || !isGestorUser) {
    return <MsglAuth onSuccess={(u) => setSessionUser(u)} currentUser={sessionUser} />;
  }

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
      <div className="flex-1 md:pl-[287px] flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        {/* Simulation Banner across admin portal */}
        {sessionUser?.isSimulated && (
          <aside
            aria-label="Aviso de Modo Simulação"
            className="bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/30 px-6 lg:px-10 py-2.5 flex items-center justify-between gap-4 text-xs text-amber-900 dark:text-amber-200 sticky top-0 z-40 backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Modo de Simulação Ativo: A navegar como <strong>{sessionUser.displayName}</strong> ({sessionUser.role || "USER"})
              </span>
            </div>
            <button
              onClick={handleExitSimulation}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
              title="Restaurar sessão de Super Administrador"
            >
              Encerrar Simulação
            </button>
          </aside>
        )}

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
              {sessionUser?.email || "andre.gabry@dynamox.net"}
            </div>

            {/* Change Own Password Button */}
            <button
              type="button"
              onClick={handleOpenChangeOwnPassword}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition cursor-pointer"
              title="Alterar a minha palavra-passe"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#e95c0c]" />
              <span className="hidden sm:inline">Alterar Senha</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/40 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
              title="Terminar Sessão no Gestor MSGL"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Page Children */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto min-w-0">
          {children}
        </main>
      </div>

      {/* =================================================================== */}
      {/* MODAL: ALTERAR A MINHA PALAVRA-PASSE (SUPER ADMIN / GESTOR)          */}
      {/* =================================================================== */}
      {mounted && isOwnPasswordModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs transition">
          <div className="bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 text-slate-800 dark:text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-[#e95c0c]/15 text-[#e95c0c] flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#223546] dark:text-white">
                    Alterar a Minha Palavra-passe
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">{sessionUser?.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOwnPasswordModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error / Success Notifications */}
            {ownPasswordError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ownPasswordError}</span>
              </div>
            )}

            {ownPasswordSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{ownPasswordSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmitOwnPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Palavra-passe Atual:
                </label>
                <div className="relative">
                  <input
                    type={ownShowCurrent ? "text" : "password"}
                    value={ownCurrentPassword}
                    onChange={(e) => setOwnCurrentPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Digite a palavra-passe atual"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setOwnShowCurrent(!ownShowCurrent)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {ownShowCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nova Palavra-passe (Mínimo 6 caracteres):
                </label>
                <div className="relative">
                  <input
                    type={ownShowNew ? "text" : "password"}
                    value={ownNewPassword}
                    onChange={(e) => setOwnNewPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Digite a nova palavra-passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setOwnShowNew(!ownShowNew)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {ownShowNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar Nova Palavra-passe:
                </label>
                <div className="relative">
                  <input
                    type={ownShowConfirm ? "text" : "password"}
                    value={ownConfirmPassword}
                    onChange={(e) => setOwnConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Repita a nova palavra-passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setOwnShowConfirm(!ownShowConfirm)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {ownShowConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setIsOwnPasswordModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={ownPasswordSubmitting}
                  className="px-5 py-2 bg-[#e95c0c] hover:bg-[#d04f08] disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  {ownPasswordSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>A Gravar...</span>
                    </>
                  ) : (
                    <span>Guardar Palavra-passe</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
