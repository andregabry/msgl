"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { AppSwal, toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

interface UserItem {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  externalIdentities?: any[];
}

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Permission Modal State (Liga/Desliga Switches)
  const [isPermModalOpen, setIsPermModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  // 5 Modules: Liga / Desliga
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

  // Open Permission Modal with switches initialized to user's permissions
  const handleOpenPermissions = (u: UserItem) => {
    setEditingUser(u);

    // Initialize switches according to role
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
      // USER: Chat-only
      setPermAdmin(false);
      setPermChat(true);
      setPermBackups(false);
      setPermMigration(false);
      setPermAudit(false);
    }

    setIsPermModalOpen(true);
  };

  // Toggle Admin switch (turning Admin ON turns all switches ON)
  const handleToggleAdmin = (enable: boolean) => {
    setPermAdmin(enable);
    if (enable) {
      setPermChat(true);
      setPermBackups(true);
      setPermMigration(true);
      setPermAudit(true);
    }
  };

  // When turning off any submodule, admin switch turns off
  const handleToggleSubmodule = (setter: (val: boolean) => void, val: boolean) => {
    setter(val);
    if (!val && permAdmin) {
      setPermAdmin(false);
    }
  };

  // Check if user is Chat-Only
  const isChatOnly = permChat && !permBackups && !permMigration && !permAudit && !permAdmin;

  // Save Permissions
  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    // Calculate effective role
    let computedRole = "USER";
    if (permAdmin) computedRole = "ADMIN";
    else if (permBackups && permMigration) computedRole = "MIGRATION_OPERATOR";
    else if (permBackups) computedRole = "BACKUP_OPERATOR";
    else if (permMigration) computedRole = "MIGRATION_OPERATOR";
    else if (permAudit) computedRole = "AUDITOR";
    else if (permChat) computedRole = "USER";

    setSavingPerms(true);
    showLoading("A Guardar Permissões...", `A atualizar permissões de ${editingUser.displayName}...`);

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
      hideLoading();

      if (res.ok) {
        setIsPermModalOpen(false);
        toast.success(
          "Permissões Atualizadas!",
          isChatOnly
            ? `${editingUser.displayName} configurado com Acesso Exclusivo ao Portal Google Chat.`
            : `Permissões de ${editingUser.displayName} gravadas com sucesso (${computedRole}).`
        );
        fetchUsers();
      } else {
        dialog.error("Erro ao Atualizar Permissões", data.error || "Falha na atualização.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setSavingPerms(false);
    }
  };

  // Create User Dialog
  const handleCreateUser = async () => {
    const { value: formValues } = await AppSwal.fire({
      title: "Novo Utilizador Interno",
      html: `
        <div class="space-y-4 text-left pt-2 font-sans">
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Nome de Exibição:</label>
            <input id="swal-name" class="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none" placeholder="Ex: Maria Santos">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">E-mail Principal:</label>
            <input id="swal-email" type="email" class="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none" placeholder="colaborador@dominio.pt">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Acesso Inicial:</label>
            <select id="swal-role" class="w-full bg-slate-50 dark:bg-[#121921] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none">
              <option value="USER" selected>Portal Google Chat (Acesso Exclusivo a Chats)</option>
              <option value="BACKUP_OPERATOR">Operador de Backups (Vault & Storage)</option>
              <option value="MIGRATION_OPERATOR">Operador de Migração (M365 & Purview)</option>
              <option value="AUDITOR">Auditor (Acesso a Registos de Auditoria)</option>
              <option value="ADMIN">Super Administrador (Acesso Integral)</option>
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Criar Utilizador",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = (document.getElementById("swal-name") as HTMLInputElement)?.value.trim();
        const email = (document.getElementById("swal-email") as HTMLInputElement)?.value.trim();
        const role = (document.getElementById("swal-role") as HTMLSelectElement)?.value;

        if (!name || !email) {
          AppSwal.showValidationMessage("Por favor preencha o nome e o e-mail.");
          return false;
        }
        return { displayName: name, email, role };
      },
    });

    if (!formValues) return;

    showLoading("A Registar Utilizador...", "A criar registo de colaborador na base de dados...");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Utilizador Criado!", `Acesso concedido a ${formValues.email}.`);
        fetchUsers();
      } else {
        dialog.error("Erro ao Criar Utilizador", data.error || "Não foi possível guardar o utilizador.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Simulate logging in as this user to immediately verify their view
  const handleSimulateUser = async (u: UserItem) => {
    const isTargetChatOnly = u.role === "USER";
    const confirm = await confirmAction({
      title: `Simular Sessão de ${u.displayName}?`,
      text: isTargetChatOnly
        ? `Este utilizador possui apenas permissão de Google Chat. O sistema abrirá imediatamente o Portal Google Chat exclusivo (/portal/chat) sem os menus administrativos.`
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
        body: JSON.stringify({ email: u.email }),
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
      {/* Title & Action */}
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

        <button
          onClick={handleCreateUser}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Criar Utilizador Interno</span>
        </button>
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

                      <td className="py-3.5 px-4 text-right space-x-2">
                        {/* Simulate Session Button */}
                        <button
                          onClick={() => handleSimulateUser(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
                          title="Iniciar sessão simulada com este perfil"
                        >
                          <LogIn className="w-3 h-3 text-slate-500" />
                          <span>Simular</span>
                        </button>

                        {/* Edit Permissions Button */}
                        <button
                          onClick={() => handleOpenPermissions(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#e95c0c]/10 hover:bg-[#e95c0c]/20 text-[#e95c0c] border border-[#e95c0c]/30 rounded-lg text-xs font-bold transition cursor-pointer"
                          title="Configurar permissões liga/desliga"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Permissões</span>
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

      {/* =================================================================== */}
      {/* MODAL DE PERMISSÕES NO ESTILO LIGA / DESLIGA                         */}
      {/* =================================================================== */}
      {isPermModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/70 backdrop-blur-xs transition">
          <div className="bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-6 text-slate-800 dark:text-white max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-[#e95c0c] flex items-center justify-center font-bold">
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
                onClick={() => setIsPermModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
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

                {/* Switch Liga/Desliga */}
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
