"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Shield,
  UserCheck,
  RefreshCw,
  CheckCircle2,
  UserPlus,
  Edit3,
  MessageSquare,
  Database,
  ArrowRightLeft,
  Settings,
  X,
  Save,
  LogIn,
  Sliders,
  Check,
  AlertCircle,
  HelpCircle,
  KeyRound,
  Copy,
  MoreVertical,
  Eye,
  EyeOff,
} from "lucide-react";
import { AppSwal, toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

interface UserItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  systemAccess?: string;
  mustChangePassword?: boolean;
  hasPassword?: boolean;
  externalIdentities?: any[];
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Active Dropdown state (stores user and viewport coordinates for portal rendering)
  const [dropdownState, setDropdownState] = useState<{
    user: UserItem;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);

  const handleToggleDropdown = (e: React.MouseEvent<HTMLButtonElement>, u: UserItem) => {
    e.stopPropagation();
    if (dropdownState?.user.id === u.id) {
      setDropdownState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 220; // approximate height of the dropdown
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

    setDropdownState({
      user: u,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left: rect.right - 224, // 224px is w-56
      openUpwards,
    });
  };

  // Close dropdown on click outside, scroll or resize
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#user-floating-dropdown-portal") && !target.closest(".user-action-dropdown-btn")) {
        setDropdownState(null);
      }
    };
    const handleScrollOrResize = () => {
      setDropdownState(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, []);

  // =========================================================================
  // 1. MODAL: GESTÃO DE PALAVRA-PASSE DE UTILIZADOR
  // =========================================================================
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState<UserItem | null>(null);
  const [passwordTab, setPasswordTab] = useState<"manual" | "reset">("manual");
  const [manualPassword, setManualPassword] = useState("");
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [requireChangeOnLogin, setRequireChangeOnLogin] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generatedTempPassword, setGeneratedTempPassword] = useState<string | null>(null);
  const [tempPasswordCopied, setTempPasswordCopied] = useState(false);

  const handleOpenPasswordModal = (u: UserItem) => {
    setPasswordTargetUser(u);
    setPasswordTab("manual");
    setManualPassword("");
    setShowManualPassword(false);
    setRequireChangeOnLogin(false);
    setPasswordSubmitting(false);
    setPasswordSuccess(null);
    setPasswordError(null);
    setGeneratedTempPassword(null);
    setTempPasswordCopied(false);
    setIsPasswordModalOpen(true);
  };

  const handleSaveManualPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetUser) return;
    if (!manualPassword || manualPassword.trim().length < 6) {
      setPasswordError("A palavra-passe deve conter pelo menos 6 caracteres.");
      return;
    }

    setPasswordSubmitting(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const res = await fetch("/api/admin/users/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: passwordTargetUser.id,
          newPassword: manualPassword.trim(),
          requireChangeOnLogin,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess(`Palavra-passe definida com sucesso para ${passwordTargetUser.displayName}!`);
        toast.success("Palavra-passe Gravada!", `Acesso atualizado com sucesso.`);
        fetchUsers();
        setTimeout(() => {
          setIsPasswordModalOpen(false);
        }, 1500);
      } else {
        setPasswordError(data.error || "Não foi possível definir a palavra-passe.");
      }
    } catch (err: any) {
      setPasswordError(err.message || "Erro inesperado de ligação.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleExecuteResetPassword = async () => {
    if (!passwordTargetUser) return;

    setPasswordSubmitting(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    setGeneratedTempPassword(null);
    setTempPasswordCopied(false);

    try {
      const res = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: passwordTargetUser.id }),
      });
      const data = await res.json();
      if (res.ok && data.temporaryPassword) {
        setGeneratedTempPassword(data.temporaryPassword);
        setPasswordSuccess(`Palavra-passe temporária enviada por e-mail para ${passwordTargetUser.email}.`);
        toast.success("Palavra-passe Temporária Gerada!", "Verifique os detalhes no ecrã.");
        fetchUsers();
      } else {
        setPasswordError(data.error || "Não foi possível redefinir a palavra-passe.");
      }
    } catch (err: any) {
      setPasswordError(err.message || "Erro inesperado.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleCopyTempPassword = () => {
    if (!generatedTempPassword) return;
    navigator.clipboard.writeText(generatedTempPassword);
    setTempPasswordCopied(true);
    toast.success("Copiada!", "Palavra-passe temporária copiada para a área de transferência.");
    setTimeout(() => setTempPasswordCopied(false), 3000);
  };

  // =========================================================================
  // 2. MODAL: CRIAR NOVO UTILIZADOR INTERNO
  // =========================================================================
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState("USER");
  const [createPassword, setCreatePassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleOpenCreateModal = () => {
    setCreateName("");
    setCreateEmail("");
    setCreateRole("USER");
    setCreatePassword("");
    setShowCreatePassword(false);
    setCreateError(null);
    setCreateSubmitting(false);
    setIsCreateUserModalOpen(true);
  };

  const handleSaveCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createEmail.trim()) {
      setCreateError("Por favor preencha o nome e o endereço de e-mail.");
      return;
    }

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: createName.trim(),
          email: createEmail.trim(),
          role: createRole,
          password: createPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Utilizador Criado!", `Acesso concedido a ${createEmail}.`);
        setIsCreateUserModalOpen(false);
        fetchUsers();
      } else {
        setCreateError(data.error || "Não foi possível guardar o utilizador.");
      }
    } catch (err: any) {
      setCreateError(err.message || "Erro inesperado.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // =========================================================================
  // 3. MODAL: ALTERAR A MINHA PALAVRA-PASSE (SUPER ADMIN)
  // =========================================================================
  const [isOwnPasswordModalOpen, setIsOwnPasswordModalOpen] = useState(false);
  const [ownCurrentPassword, setOwnCurrentPassword] = useState("");
  const [ownNewPassword, setOwnNewPassword] = useState("");
  const [ownConfirmPassword, setOwnConfirmPassword] = useState("");
  const [showOwnCurrent, setShowOwnCurrent] = useState(false);
  const [showOwnNew, setShowOwnNew] = useState(false);
  const [showOwnConfirm, setShowOwnConfirm] = useState(false);
  const [ownSubmitting, setOwnSubmitting] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const [ownSuccess, setOwnSuccess] = useState<string | null>(null);

  const handleOpenChangeMyPassword = () => {
    setOwnCurrentPassword("");
    setOwnNewPassword("");
    setOwnConfirmPassword("");
    setShowOwnCurrent(false);
    setShowOwnNew(false);
    setShowOwnConfirm(false);
    setOwnError(null);
    setOwnSuccess(null);
    setOwnSubmitting(false);
    setIsOwnPasswordModalOpen(true);
  };

  const handleSaveOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownCurrentPassword) {
      setOwnError("Por favor informe a sua palavra-passe atual.");
      return;
    }
    if (!ownNewPassword || ownNewPassword.length < 6) {
      setOwnError("A nova palavra-passe deve conter pelo menos 6 caracteres.");
      return;
    }
    if (ownNewPassword !== ownConfirmPassword) {
      setOwnError("A confirmação da nova palavra-passe não coincide.");
      return;
    }

    setOwnSubmitting(true);
    setOwnError(null);
    setOwnSuccess(null);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: ownCurrentPassword,
          newPassword: ownNewPassword,
          confirmPassword: ownConfirmPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOwnSuccess("Palavra-passe alterada com sucesso!");
        toast.success("Palavra-passe Alterada!", "A sua nova palavra-passe foi guardada.");
        setTimeout(() => setIsOwnPasswordModalOpen(false), 1200);
      } else {
        setOwnError(data.error || "Não foi possível atualizar a palavra-passe.");
      }
    } catch (err: any) {
      setOwnError(err.message || "Erro inesperado.");
    } finally {
      setOwnSubmitting(false);
    }
  };

  // =========================================================================
  // 4. MODAL: PERMISSÕES LIGA / DESLIGA
  // =========================================================================
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [permChat, setPermChat] = useState(true);
  const [permBackups, setPermBackups] = useState(false);
  const [permMigration, setPermMigration] = useState(false);
  const [permAudit, setPermAudit] = useState(false);
  const [permAdmin, setPermAdmin] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenPermissions = (u: UserItem) => {
    setEditingUser(u);

    if (u.role === "ADMIN") {
      setPermAdmin(true);
      setPermChat(true);
      setPermBackups(true);
      setPermMigration(true);
      setPermAudit(true);
    } else if (u.role === "BACKUP_OPERATOR") {
      setPermAdmin(false);
      setPermChat(true);
      setPermBackups(true);
      setPermMigration(false);
      setPermAudit(true);
    } else if (u.role === "MIGRATION_OPERATOR") {
      setPermAdmin(false);
      setPermChat(true);
      setPermBackups(false);
      setPermMigration(true);
      setPermAudit(true);
    } else if (u.role === "AUDITOR") {
      setPermAdmin(false);
      setPermChat(false);
      setPermBackups(false);
      setPermMigration(false);
      setPermAudit(true);
    } else {
      setPermAdmin(false);
      setPermChat(true);
      setPermBackups(false);
      setPermMigration(false);
      setPermAudit(false);
    }

    setIsPermModalOpen(true);
  };

  const handleToggleAdmin = (enable: boolean) => {
    setPermAdmin(enable);
    if (enable) {
      setPermChat(true);
      setPermBackups(true);
      setPermMigration(true);
      setPermAudit(true);
    }
  };

  const handleToggleSubmodule = (setter: (val: boolean) => void, val: boolean) => {
    setter(val);
    if (!val && permAdmin) {
      setPermAdmin(false);
    }
  };

  const isChatOnly = permChat && !permBackups && !permMigration && !permAudit && !permAdmin;

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    let computedRole = "USER";
    if (permAdmin) computedRole = "ADMIN";
    else if (permBackups && permMigration) computedRole = "MIGRATION_OPERATOR";
    else if (permBackups) computedRole = "BACKUP_OPERATOR";
    else if (permMigration) computedRole = "MIGRATION_OPERATOR";
    else if (permAudit) computedRole = "AUDITOR";
    else if (permChat) computedRole = "USER";

    setSavingPerms(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editingUser.email,
          displayName: editingUser.displayName,
          role: computedRole,
          permissions: {
            chat: permChat,
            backups: permBackups,
            migration: permMigration,
            audit: permAudit,
            admin: permAdmin,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsPermModalOpen(false);
        toast.success(
          "Permissões Atualizadas!",
          isChatOnly
            ? `${editingUser.displayName} configurado com Acesso Exclusivo ao Portal Google Chat.`
            : `Permissões de ${editingUser.displayName} gravadas (${computedRole}).`
        );
        fetchUsers();
      } else {
        dialog.error("Erro ao Atualizar Permissões", data.error || "Falha na atualização.");
      }
    } catch (err: any) {
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setSavingPerms(false);
    }
  };

  // Simulate logging in as this user
  const handleSimulateUser = async (u: UserItem) => {
    const isTargetChatOnly = u.role === "USER";
    const confirm = await confirmAction({
      title: `Simular Sessão de ${u.displayName}?`,
      text: isTargetChatOnly
        ? `Este utilizador possui apenas permissão de Google Chat. O sistema abrirá imediatamente o Portal Google Chat (/portal/chat) sem os menus administrativos.`
        : `Deseja mudar a sessão ativa para ${u.displayName} (${u.role})?`,
      confirmText: "Simular Agora",
      cancelText: "Voltar",
      icon: "question",
    });

    if (!confirm) return;

    showLoading("A Simular Sessão...", `A autenticar como ${u.email}...`);
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, simulate: true }),
      });
      const data = await res.json();
      hideLoading();

      if (res.ok) {
        toast.success("Sessão Ativada!", `A navegar como ${u.displayName}...`);
        if (isTargetChatOnly) {
          window.location.href = "/portal/chat";
        } else {
          window.location.href = "/";
        }
      } else {
        dialog.error("Erro de Autenticação", data.error || "Não foi possível simular a sessão.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] dark:text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-[#e95c0c]" />
            Utilizadores Internos & Gestão de Permissões
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Atribuição granular de módulos operacionais (Google Chat, Backups, Migração M365, Auditoria e Administração).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenChangeMyPassword}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
            title="Alterar a palavra-passe da sua conta com sessão iniciada"
          >
            <KeyRound className="w-4 h-4 text-[#e95c0c]" />
            <span>A Minha Senha</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Criar Utilizador Interno</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#121921] border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3.5 px-4">Nome de Exibição</th>
                <th className="py-3.5 px-4">E-mail Principal</th>
                <th className="py-3.5 px-4 text-center">Acesso / Perfil</th>
                <th className="py-3.5 px-4 text-center">Destino ao Iniciar Sessão</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4">Criado em</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    A carregar utilizadores da plataforma...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhum utilizador interno registado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const userIsChatOnly = u.role === "USER";

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold flex items-center justify-center shrink-0">
                          {u.displayName?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <span>{u.displayName}</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">{u.email}</td>

                      <td className="py-3.5 px-4 text-center">
                        {userIsChatOnly ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                            <MessageSquare className="w-3 h-3 text-teal-600" />
                            Portal Chat Exclusivo
                          </span>
                        ) : u.role === "ADMIN" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            <Shield className="w-3 h-3 text-purple-600" />
                            Super Admin
                          </span>
                        ) : u.role === "BACKUP_OPERATOR" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <Database className="w-3 h-3 text-blue-600" />
                            Operador Backups
                          </span>
                        ) : u.role === "MIGRATION_OPERATOR" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <ArrowRightLeft className="w-3 h-3 text-amber-600" />
                            Operador Migração
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Auditor
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {userIsChatOnly ? (
                          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
                            /portal/chat (Sem Admin)
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            / (Hub Geral Administrativo)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString("pt-PT")}
                      </td>

                      {/* Clean Three-Dots Action Dropdown Menu */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => handleToggleDropdown(e, u)}
                          className={`user-action-dropdown-btn p-2 rounded-lg border transition cursor-pointer ${
                            dropdownState?.user.id === u.id
                              ? "bg-[#e95c0c]/10 border-[#e95c0c]/50 text-[#e95c0c]"
                              : "bg-white dark:bg-[#15202c] border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}
                          title="Menu de Ações do Utilizador"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Menu via Portal (completely immune to card & table overflow clipping) */}
      {mounted && dropdownState && createPortal(
        <div
          id="user-floating-dropdown-portal"
          style={{
            position: "fixed",
            top: dropdownState.openUpwards ? undefined : `${dropdownState.top}px`,
            bottom: dropdownState.openUpwards ? `${Math.max(8, window.innerHeight - dropdownState.top)}px` : undefined,
            left: `${Math.max(16, Math.min(dropdownState.left, window.innerWidth - 240))}px`,
            zIndex: 99999,
          }}
          className="w-56 bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xl py-1.5 divide-y divide-slate-100 dark:divide-slate-700/60 animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          <div className="px-3.5 py-1.5">
            <div className="text-[11px] font-black text-slate-900 dark:text-white truncate">
              {dropdownState.user.displayName}
            </div>
            <div className="text-[10px] font-mono text-slate-400 truncate">
              {dropdownState.user.email}
            </div>
          </div>

          <div className="py-1">
            <button
              type="button"
              onClick={() => {
                const u = dropdownState.user;
                setDropdownState(null);
                handleOpenPasswordModal(u);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-300 transition text-left cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              <span>Gerir Palavra-passe</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const u = dropdownState.user;
                setDropdownState(null);
                handleOpenPermissions(u);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-[#e95c0c]/10 hover:text-[#e95c0c] transition text-left cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-[#e95c0c]" />
              <span>Configurar Permissões</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const u = dropdownState.user;
                setDropdownState(null);
                handleSimulateUser(u);
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-left cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-slate-400" />
              <span>Simular Sessão (Chat)</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* =================================================================== */}
      {/* MODAL 1: GESTÃO DE PALAVRA-PASSE DE UTILIZADOR                      */}
      {/* =================================================================== */}
      {isPasswordModalOpen && passwordTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs transition">
          <div className="bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 text-slate-800 dark:text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#223546] dark:text-white">
                    Gerir Palavra-passe
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    {passwordTargetUser.displayName} &bull; {passwordTargetUser.email}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error & Success Alerts */}
            {passwordError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {/* Segmented Mode Tabs */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-[#121921] p-1 border border-slate-200 dark:border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setPasswordTab("manual");
                  setPasswordError(null);
                }}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                  passwordTab === "manual"
                    ? "bg-white dark:bg-[#1c2836] text-[#e95c0c] shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Definir Manualmente
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordTab("reset");
                  setPasswordError(null);
                }}
                className={`flex-1 py-2 rounded-lg transition cursor-pointer ${
                  passwordTab === "reset"
                    ? "bg-white dark:bg-[#1c2836] text-[#e95c0c] shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                Resetar por E-mail (8 Caracteres)
              </button>
            </div>

            {/* TAB A: DEFINIR MANUALMENTE */}
            {passwordTab === "manual" && (
              <form onSubmit={handleSaveManualPassword} className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Digite e escolha a nova palavra-passe que pretende atribuir a este utilizador.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nova Palavra-passe (Mínimo 6 caracteres):
                  </label>
                  <div className="relative">
                    <input
                      type={showManualPassword ? "text" : "password"}
                      value={manualPassword}
                      onChange={(e) => setManualPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:border-[#e95c0c] focus:outline-none"
                      placeholder="Digite a palavra-passe pretendida"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowManualPassword(!showManualPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showManualPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="chk-require-change"
                    type="checkbox"
                    checked={requireChangeOnLogin}
                    onChange={(e) => setRequireChangeOnLogin(e.target.checked)}
                    className="w-4 h-4 text-[#e95c0c] rounded border-slate-300 dark:border-slate-700 focus:ring-[#e95c0c] cursor-pointer"
                  />
                  <label
                    htmlFor="chk-require-change"
                    className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Exigir alteração de palavra-passe no próximo início de sessão
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={passwordSubmitting}
                    className="px-5 py-2 bg-[#e95c0c] hover:bg-[#d04f08] disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-2"
                  >
                    {passwordSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>A Gravar...</span>
                      </>
                    ) : (
                      <span>Gravar Palavra-passe</span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* TAB B: RESETAR POR E-MAIL */}
            {passwordTab === "reset" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  O sistema irá gerar automaticamente uma nova palavra-passe temporária alfanumérica de{" "}
                  <strong>8 caracteres</strong>, enviá-la para o e-mail{" "}
                  <code className="text-teal-600 dark:text-teal-400 font-bold">{passwordTargetUser.email}</code> e exibi-la
                  no ecrã para cópia imediata.
                </p>

                {generatedTempPassword ? (
                  <div className="space-y-3 pt-2">
                    <div className="p-4 bg-teal-50 dark:bg-teal-950/50 border-2 border-dashed border-teal-500 rounded-xl text-center space-y-1">
                      <div className="text-[11px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider">
                        Palavra-passe Temporária Gerada
                      </div>
                      <div className="font-mono text-2xl font-black tracking-widest text-teal-700 dark:text-teal-300 select-all py-1">
                        {generatedTempPassword}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyTempPassword}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                      >
                        {tempPasswordCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{tempPasswordCopied ? "Copiada para a Área de Transferência!" : "Copiar Palavra-passe"}</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                      ⚠️ O utilizador será obrigado a alterar esta palavra-passe no primeiro acesso ao sistema.
                    </p>
                  </div>
                ) : (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleExecuteResetPassword}
                      disabled={passwordSubmitting}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#e95c0c] hover:bg-[#d04f08] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                    >
                      {passwordSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>A Gerar Senha e Enviar E-mail...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          <span>Gerar e Enviar Senha Temporária (8 Caracteres)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: CRIAR NOVO UTILIZADOR INTERNO                              */}
      {/* =================================================================== */}
      {isCreateUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs transition">
          <div className="bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 text-slate-800 dark:text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-[#e95c0c]/15 text-[#e95c0c] flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#223546] dark:text-white">
                    Novo Utilizador Interno
                  </h2>
                  <p className="text-xs text-slate-400">Registo de colaborador na plataforma</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateUserModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error alert */}
            {createError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome de Exibição:
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none"
                  placeholder="Ex: Maria Santos"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail Principal:
                </label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none"
                  placeholder="colaborador@dominio.pt"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Acesso Inicial:
                </label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none"
                >
                  <option value="USER">Portal Google Chat (Acesso Exclusivo a Chats)</option>
                  <option value="BACKUP_OPERATOR">Operador de Backups (Vault & Storage)</option>
                  <option value="MIGRATION_OPERATOR">Operador de Migração (M365 & Purview)</option>
                  <option value="AUDITOR">Auditor (Acesso a Registos de Auditoria)</option>
                  <option value="ADMIN">Super Administrador (Acesso Integral)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Palavra-Passe Inicial (Opcional):
                </label>
                <div className="relative">
                  <input
                    type={showCreatePassword ? "text" : "password"}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Deixar em branco para definir no primeiro acesso"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Se deixar em branco, o utilizador receberá a palavra-passe temporária de 8 caracteres por e-mail no primeiro acesso.
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setIsCreateUserModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2 bg-[#e95c0c] hover:bg-[#d04f08] disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  {createSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>A Criar...</span>
                    </>
                  ) : (
                    <span>Criar Utilizador</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: ALTERAR A MINHA PALAVRA-PASSE (SUPER ADMIN)                */}
      {/* =================================================================== */}
      {isOwnPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs transition">
          <div className="bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 text-slate-800 dark:text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-[#e95c0c]/15 text-[#e95c0c] flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#223546] dark:text-white">
                    Alterar a Minha Palavra-passe
                  </h2>
                  <p className="text-xs text-slate-400">Administrador com sessão ativa</p>
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

            {/* Error & Success */}
            {ownError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{ownError}</span>
              </div>
            )}

            {ownSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{ownSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSaveOwnPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Palavra-passe Atual:
                </label>
                <div className="relative">
                  <input
                    type={showOwnCurrent ? "text" : "password"}
                    value={ownCurrentPassword}
                    onChange={(e) => setOwnCurrentPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Digite a palavra-passe atual"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnCurrent(!showOwnCurrent)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showOwnCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nova Palavra-passe (Mínimo 6 caracteres):
                </label>
                <div className="relative">
                  <input
                    type={showOwnNew ? "text" : "password"}
                    value={ownNewPassword}
                    onChange={(e) => setOwnNewPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Digite a nova palavra-passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnNew(!showOwnNew)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showOwnNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar Nova Palavra-passe:
                </label>
                <div className="relative">
                  <input
                    type={showOwnConfirm ? "text" : "password"}
                    value={ownConfirmPassword}
                    onChange={(e) => setOwnConfirmPassword(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 pr-10 text-sm focus:border-[#e95c0c] focus:outline-none"
                    placeholder="Repita a nova palavra-passe"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnConfirm(!showOwnConfirm)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showOwnConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Actions */}
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
                  disabled={ownSubmitting}
                  className="px-5 py-2 bg-[#e95c0c] hover:bg-[#d04f08] disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-2"
                >
                  {ownSubmitting ? (
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
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: PERMISSÕES LIGA / DESLIGA                                  */}
      {/* =================================================================== */}
      {isPermModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-xs transition">
          <div className="bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-6 text-slate-800 dark:text-white max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-[#e95c0c]/15 text-[#e95c0c] flex items-center justify-center font-bold">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#223546] dark:text-white">
                    Permissões de Acesso de {editingUser.displayName}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">{editingUser.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPermModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanatory Banner */}
            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Ative ou desative os módulos aos quais este utilizador tem acesso através dos seletores{" "}
              <strong>Liga / Desliga</strong> abaixo.
            </div>

            {/* List of Permissions / Modules */}
            <form onSubmit={handleSavePermissions} className="space-y-3.5">
              {/* 1. Google Chat Portal */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-[#121921]/60 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                      Portal Google Chat (Histórico)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Consulta e pesquisa de mensagens, conversas diretas e anexos arquivados do Google Chat.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={permChat}
                    onClick={() => handleToggleSubmodule(setPermChat, !permChat)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permChat ? "bg-[#e95c0c]" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                        permChat ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-black uppercase w-16 text-right ${
                      permChat ? "text-[#e95c0c]" : "text-slate-400"
                    }`}
                  >
                    {permChat ? "Ligado" : "Desligado"}
                  </span>
                </div>
              </div>

              {/* 2. Google Backups & Vault */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-[#121921]/60 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                      Gestão de Backups & Google Vault
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Solicitar, monitorizar, descarregar e processar exportações do Google Vault e Gmail.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={permBackups}
                    onClick={() => handleToggleSubmodule(setPermBackups, !permBackups)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permBackups ? "bg-[#e95c0c]" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                        permBackups ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-black uppercase w-16 text-right ${
                      permBackups ? "text-[#e95c0c]" : "text-slate-400"
                    }`}
                  >
                    {permBackups ? "Ligado" : "Desligado"}
                  </span>
                </div>
              </div>

              {/* 3. Microsoft 365 Migration */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-[#121921]/60 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                      Migração para Microsoft 365
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Mapear grupos Google para caixas M365, preparar pacotes PST e inserção direta via Graph.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={permMigration}
                    onClick={() => handleToggleSubmodule(setPermMigration, !permMigration)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permMigration ? "bg-[#e95c0c]" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                        permMigration ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-black uppercase w-16 text-right ${
                      permMigration ? "text-[#e95c0c]" : "text-slate-400"
                    }`}
                  >
                    {permMigration ? "Ligado" : "Desligado"}
                  </span>
                </div>
              </div>

              {/* 4. Audit & Logs */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/70 bg-slate-50/50 dark:bg-[#121921]/60 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                      Registos de Auditoria & Conformidade
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Visualização de trilhas de auditoria, eventos de segurança e conformidade de operações.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={permAudit}
                    onClick={() => handleToggleSubmodule(setPermAudit, !permAudit)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permAudit ? "bg-[#e95c0c]" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                        permAudit ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-black uppercase w-16 text-right ${
                      permAudit ? "text-[#e95c0c]" : "text-slate-400"
                    }`}
                  >
                    {permAudit ? "Ligado" : "Desligado"}
                  </span>
                </div>
              </div>

              {/* 5. Super Admin */}
              <div className="p-3.5 rounded-xl border-2 border-[#e95c0c]/40 dark:border-[#e95c0c]/60 bg-orange-50/30 dark:bg-orange-950/20 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#e95c0c]/10 text-[#e95c0c] flex items-center justify-center shrink-0 mt-0.5">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-[#e95c0c]">
                      Administração Integral (Super Admin)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Acesso irrestrito a todos os menus, gestão de utilizadores e configurações globais de Cloud.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={permAdmin}
                    onClick={() => handleToggleAdmin(!permAdmin)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      permAdmin ? "bg-[#e95c0c]" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                        permAdmin ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-black uppercase w-16 text-right ${
                      permAdmin ? "text-[#e95c0c]" : "text-slate-400"
                    }`}
                  >
                    {permAdmin ? "Ligado" : "Desligado"}
                  </span>
                </div>
              </div>

              {/* Dynamic Information Banner */}
              {isChatOnly ? (
                <div className="p-3.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 rounded-xl flex items-start gap-3 text-xs text-teal-900 dark:text-teal-200">
                  <MessageSquare className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Acesso Exclusivo ao Portal Google Chat</div>
                    <div className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                      Ao iniciar sessão, este colaborador abrirá diretamente o{" "}
                      <strong>Portal Google Chat (/portal/chat)</strong>. Não terá acesso à barra lateral administrativa nem aos módulos de migração ou definições de Cloud.
                    </div>
                  </div>
                </div>
              ) : permAdmin ? (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl flex items-center gap-2.5 text-xs text-purple-900 dark:text-purple-200">
                  <Shield className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>
                    <strong>Perfil Super Admin:</strong> Acesso integral a todas as ferramentas e configurações de sistema.
                  </span>
                </div>
              ) : null}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setIsPermModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPerms}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingPerms ? "A Guardar..." : "Guardar Permissões"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
