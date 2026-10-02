"use client";

import React, { useEffect, useState } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Database,
  MessageSquare,
  Mail,
  UserCheck,
  Download,
  AlertCircle,
  X,
  FolderArchive,
} from "lucide-react";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export default function GoogleAccountsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modal State
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"resumo" | "backups" | "gmail" | "chat" | "interna" | "historico">("resumo");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/google/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Erro ao carregar utilizadores:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const handleSync = async () => {
    setSyncing(true);
    showLoading("A Sincronizar Utilizadores Google", "A ligar à Google Admin SDK Directory API...");
    try {
      const res = await fetch("/api/google/users", { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Sincronização Concluída!", `Total de utilizadores sincronizados: ${data.totalSynced}`);
        fetchUsers();
      } else {
        dialog.error("Erro na Sincronização", data.error || "Não foi possível concluir a sincronização.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha de Comunicação", err.message || "Erro inesperado.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncLocalBackups = async () => {
    setSyncingLocal(true);
    showLoading("A Varrer Ficheiros no Disco...", "A detetar ficheiros de backup (MBOX, ZIP) no armazenamento...");
    try {
      const res = await fetch("/api/backups/sync-local", { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success(
          "Varredura Concluída!",
          `${data.discoveredCount} ficheiros detetados. ${data.registeredCount} novos registados, ${data.updatedCount} atualizados.`
        );
        fetchUsers();
      } else {
        dialog.error("Erro na Sincronização", data.error || "Não foi possível varrer os backups locais.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setSyncingLocal(false);
    }
  };

  const handleToggleBackupLocal = async (backupId: string, currentIsDownloaded: boolean) => {
    if (currentIsDownloaded) {
      const confirmed = await confirmAction({
        title: "Remover Backup Baixado?",
        text: "Tem a certeza que deseja remover o backup baixado do armazenamento da aplicação? Esta ação libertará espaço em disco. Os metadados continuarão guardados no sistema.",
        confirmText: "Sim, Remover Backup",
        cancelText: "Cancelar",
        icon: "warning",
      });

      if (!confirmed) return;

      setTogglingId(backupId);
      try {
        const res = await fetch("/api/backups/toggle-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupRequestId: backupId, action: "REMOVE" }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success("Backup Removido!", "A cópia local foi removida do armazenamento da aplicação.");
          if (selectedUser) openUserDetails(selectedUser);
          fetchUsers();
        } else {
          dialog.error("Erro ao Remover", data.error || "Não foi possível remover o backup.");
        }
      } catch (err: any) {
        dialog.error("Falha", err.message || "Erro inesperado.");
      } finally {
        setTogglingId(null);
      }
    } else {
      setTogglingId(backupId);
      showLoading("A Descarregar Backup...", "A descarregar e armazenar o ficheiro no diretório interno da aplicação...");
      try {
        const res = await fetch("/api/backups/toggle-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupRequestId: backupId, action: "DOWNLOAD" }),
        });
        const data = await res.json();
        hideLoading();
        if (res.ok) {
          toast.success("Download Concluído!", data.message || "Backup descarregado com sucesso.");
          if (selectedUser) openUserDetails(selectedUser);
          fetchUsers();
        } else {
          dialog.error("Erro no Download", data.error || "Não foi possível descarregar o backup.");
        }
      } catch (err: any) {
        hideLoading();
        dialog.error("Falha", err.message || "Erro inesperado ao descarregar backup.");
      } finally {
        setTogglingId(null);
      }
    }
  };

  const openUserDetails = async (userSummary: any) => {
    setSelectedUser(userSummary);
    setActiveTab("resumo");
    setActionMessage(null);
    try {
      const res = await fetch(`/api/google/users/${userSummary.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUser(data.user);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestBackup = async (serviceType: "GMAIL" | "GOOGLE_CHAT") => {
    if (!selectedUser) return;
    const serviceName = serviceType === "GMAIL" ? "Gmail" : "Google Chat";
    const confirmed = await confirmAction({
      title: `Solicitar Backup de ${serviceName}?`,
      text: `Será criada uma exportação oficial no Google Vault para a conta ${selectedUser.primaryEmail}. O download será realizado automaticamente assim que estiver concluído.`,
      confirmText: "Sim, Solicitar Backup",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading(`A criar exportação no Vault...`, `A submeter pedido de exportação para ${selectedUser.primaryEmail}...`);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityEmail: selectedUser.primaryEmail,
          entityType: "GOOGLE_USER",
          serviceType,
          format: "MBOX",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Backup Solicitado com Sucesso!", `Exportação ${serviceName} iniciada no Google Vault.`);
        openUserDetails(selectedUser);
      } else {
        dialog.error("Erro ao Solicitar Backup", data.error || "Não foi possível criar a exportação.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha de Comunicação", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateInternal = async () => {
    if (!selectedUser) return;
    const confirmed = await confirmAction({
      title: "Ativar como Utilizador da Plataforma?",
      text: `O colaborador ${selectedUser.fullName || selectedUser.primaryEmail} receberá permissão para iniciar sessão na aplicação e consultar o arquivo histórico dos seus Google Chats.`,
      confirmText: "Ativar Acesso do Colaborador",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading("A Ativar Colaborador...", "A criar conta de utilizador interno e permissões de acesso...");
    try {
      const res = await fetch("/api/admin/users/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleUserId: selectedUser.id,
          role: "USER",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Colaborador Ativado!", "Conta interna criada e associada com sucesso.");
        openUserDetails(selectedUser);
        fetchUsers();
      } else {
        dialog.error("Erro na Ativação", data.error || "Não foi possível ativar o utilizador.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#e95c0c]" />
            Contas & Utilizadores do Google Workspace
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Inventário oficial sincronizado a partir da Google Admin SDK Directory API com persistência no PostgreSQL.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSyncLocalBackups}
            disabled={syncingLocal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
            title="Varrer ficheiros de backup no disco para associar às contas"
          >
            <FolderArchive className={`w-4 h-4 text-[#e95c0c] ${syncingLocal ? "animate-spin" : ""}`} />
            <span>{syncingLocal ? "A Varrer Disco..." : "Sincronizar Backups do Disco"}</span>
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "A Sincronizar Directory..." : "Sincronizar Directory"}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#e95c0c]"
          />
        </div>

        <div className="text-xs text-slate-500 font-semibold">
          Total de contas registadas: <span className="font-bold text-[#223546]">{total}</span>
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Nome Completo</th>
                <th className="py-3 px-4">E-mail Principal</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Conta Interna</th>
                <th className="py-3 px-4 text-center">Backup Email</th>
                <th className="py-3 px-4 text-center">Backup Chat</th>
                <th className="py-3 px-4">Última Sincronização</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    A carregar contas Google...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum utilizador encontrado. Execute a sincronização inicial.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const hasGmailBackup = u.backupRequests?.some((b: any) => b.serviceType === "GMAIL" && b.status === "READY");
                  const hasChatBackup = u.backupRequests?.some((b: any) => b.serviceType === "GOOGLE_CHAT" && b.status === "READY");
                  const isInternal = u.identityLinks && u.identityLinks.length > 0;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.fullName || u.name || "(Sem nome)"}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{u.primaryEmail}</td>
                      <td className="py-3 px-4 text-center">
                        {u.suspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" /> Suspenso
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Ativo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isInternal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <UserCheck className="w-3 h-3" /> Ativada
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasGmailBackup ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Pronto
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasChatBackup ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Pronto
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openUserDetails(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver</span>
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

      {/* ------------------------------------------------------------------- */}
      {/* DETAILED MODAL / DRAWER: CONTA GOOGLE                                */}
      {/* ------------------------------------------------------------------- */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-lg font-black text-[#223546]">
                  {selectedUser.fullName || selectedUser.name || "Detalhes da Conta Google"}
                </h2>
                <p className="text-xs text-slate-500 font-mono">{selectedUser.primaryEmail}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 bg-white px-6">
              {[
                { id: "resumo", label: "Resumo" },
                { id: "backups", label: "Backups" },
                { id: "gmail", label: "Gmail" },
                { id: "chat", label: "Google Chat" },
                { id: "interna", label: "Conta Interna" },
                { id: "historico", label: "Histórico" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
                    activeTab === tab.id
                      ? "border-[#e95c0c] text-[#e95c0c]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Action Alert Banner */}
            {actionMessage && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs font-bold text-[#e95c0c] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionMessage}</span>
              </div>
            )}

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
              {activeTab === "resumo" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Google User ID</span>
                    <div className="font-mono text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">{selectedUser.providerId}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Unidade Organizacional (OU)</span>
                    <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">{selectedUser.orgUnitPath || "/"}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Aliases de E-mail</span>
                    <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">
                      {selectedUser.aliases && selectedUser.aliases.length > 0
                        ? selectedUser.aliases.map((a: any) => a.aliasEmail).join(", ")
                        : "Nenhum alias configurado"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Último Login Google</span>
                    <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">
                      {selectedUser.lastLoginTime ? new Date(selectedUser.lastLoginTime).toLocaleString("pt-PT") : "Desconhecido"}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "backups" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-[#223546]">Backups Registados</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRequestBackup("GMAIL")}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition cursor-pointer"
                      >
                        Solicitar Backup Gmail (Vault)
                      </button>
                      <button
                        onClick={() => handleRequestBackup("GOOGLE_CHAT")}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition cursor-pointer"
                      >
                        Solicitar Backup Chat (Vault)
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {selectedUser.backupRequests && selectedUser.backupRequests.length > 0 ? (
                      selectedUser.backupRequests.map((b: any) => (
                        <div key={b.id} className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-2">
                              <span>{b.serviceType}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{b.format}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  b.status === "READY"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : b.status === "REMOVED_LOCAL"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {b.status}
                              </span>
                              {b.isDownloaded && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  Guardado no App
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Criado em {new Date(b.createdAt).toLocaleString("pt-PT")} | ID: {b.id}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Botão Liga / Desliga */}
                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                              <span className="text-[11px] font-bold text-slate-600">Baixar no App:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleBackupLocal(b.id, b.isDownloaded)}
                                disabled={togglingId === b.id}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  b.isDownloaded ? "bg-emerald-600" : "bg-slate-300"
                                }`}
                                title={
                                  b.isDownloaded
                                    ? "Backup baixado no app (clique para remover cópia local)"
                                    : "Descarregar backup para o app"
                                }
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                    b.isDownloaded ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                              <span
                                className={`text-[11px] font-bold ${
                                  b.isDownloaded ? "text-emerald-700" : "text-slate-400"
                                }`}
                              >
                                {togglingId === b.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-slate-500 inline" />
                                ) : b.isDownloaded ? (
                                  "Ligado"
                                ) : (
                                  "Desligado"
                                )}
                              </span>
                            </div>

                            {b.artifacts && b.artifacts.length > 0 && (
                              <a
                                href={`/api/backups/${b.artifacts[0].id}/download`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition"
                              >
                                <Download className="w-3.5 h-3.5" /> Transferir
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400">Nenhum backup solicitado para esta conta.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "interna" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-[#223546]">Associação com Conta Interna</h3>
                  <p className="text-slate-500">
                    A ativação desta conta permite que o colaborador aceda à plataforma através do Google OAuth/OIDC e consulte os seus chats arquivados.
                  </p>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-800">
                        {selectedUser.identityLinks && selectedUser.identityLinks.length > 0
                          ? `Ativa como: ${selectedUser.identityLinks[0].appUser.displayName}`
                          : "Conta interna ainda não ativada"}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {selectedUser.identityLinks && selectedUser.identityLinks.length > 0
                          ? `Perfil RBAC: ${selectedUser.identityLinks[0].appUser.role}`
                          : "O colaborador não conseguirá iniciar sessão até que seja ativado."}
                      </div>
                    </div>

                    <button
                      onClick={handleActivateInternal}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg font-bold text-xs transition cursor-pointer"
                    >
                      {selectedUser.identityLinks && selectedUser.identityLinks.length > 0
                        ? "Revalidar Ativação"
                        : "Ativar como utilizador da plataforma"}
                    </button>
                  </div>
                </div>
              )}

              {(activeTab === "gmail" || activeTab === "chat" || activeTab === "historico") && (
                <div className="p-8 text-center text-slate-400">
                  Secção sincronizada com o arquivo central do utilizador.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
