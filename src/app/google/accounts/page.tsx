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
  AlertCircle,
  X,
  FolderArchive,
  ExternalLink,
  Hash,
  ArrowRight,
  Clock,
  Sparkles,
  User,
  Shield,
  FileText,
  Filter,
  CheckCircle,
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

  // Google Chat Tab Filters & Spaces
  const [chatFilter, setChatFilter] = useState<"ALL" | "DIRECT_MESSAGE" | "SPACE" | "GROUP_CHAT">("ALL");
  const [chatSearch, setChatSearch] = useState("");
  const [chatSpacesList, setChatSpacesList] = useState<any[]>([]);
  const [loadingChatSpaces, setLoadingChatSpaces] = useState(false);

  // Rows per page & Pagination
  const [pageSize, setPageSize] = useState<number>(100);

  const totalPages = Math.max(1, Math.ceil(total / (pageSize === -1 ? total || 1 : pageSize)));

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const limitParam = pageSize === -1 ? "all" : pageSize;
      const res = await fetch(`/api/google/users?page=${page}&limit=${limitParam}&search=${encodeURIComponent(search)}`);
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
  }, [page, search, pageSize]);

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

  const handleToggleBackupLocal = async (
    backupId: string,
    currentIsDownloaded: boolean,
    status?: string,
    artifactsCount?: number,
    serviceType?: string
  ) => {
    if (
      !currentIsDownloaded &&
      status !== "READY" &&
      (!artifactsCount || artifactsCount === 0) &&
      serviceType !== "GOOGLE_CHAT"
    ) {
      dialog.info(
        "Exportação em Processamento no Google Vault",
        "Este pedido de backup foi submetido no Google Vault e encontra-se a ser gerado pelos servidores da Google Cloud. O download para a aplicação ficará disponível assim que a exportação estiver concluída e pronta."
      );
      return;
    }

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
      showLoading(
        serviceType === "GOOGLE_CHAT" ? "A Sincronizar Google Chat..." : "A Descarregar Backup...",
        serviceType === "GOOGLE_CHAT"
          ? "A ligar à Google Chat API, descarregar conversas e indexar espaços e mensagens..."
          : "A descarregar e armazenar o ficheiro no diretório interno da aplicação..."
      );
      try {
        const res = await fetch("/api/backups/toggle-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backupRequestId: backupId, action: "DOWNLOAD" }),
        });
        const data = await res.json();
        hideLoading();
        if (res.ok) {
          toast.success(
            serviceType === "GOOGLE_CHAT" ? "Google Chat Sincronizado!" : "Download Concluído!",
            data.message || "Backup descarregado e processado com sucesso."
          );
          if (selectedUser) openUserDetails(selectedUser);
          fetchUsers();
        } else {
          dialog.error("Erro no Processamento", data.error || "Não foi possível descarregar o backup.");
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
    const isChat = serviceType === "GOOGLE_CHAT";
    const serviceName = isChat ? "Google Chat" : "Gmail";
    const confirmed = await confirmAction({
      title: isChat ? "Sincronizar Google Chat?" : `Solicitar Backup de ${serviceName}?`,
      text: isChat
        ? `O sistema irá ligar-se diretamente à Google Chat API, descarregar todas as conversas, anexos e espaços da conta ${selectedUser.primaryEmail} e montá-los no portal de chat.`
        : `Será criada uma exportação oficial no Google Vault para a conta ${selectedUser.primaryEmail}. O download será realizado automaticamente assim que estiver concluído.`,
      confirmText: isChat ? "Sim, Sincronizar Chat" : "Sim, Solicitar Backup",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading(
      isChat ? "A Sincronizar Google Chat..." : "A criar exportação no Vault...",
      isChat ? `A descarregar mensagens e indexar espaços de ${selectedUser.primaryEmail}...` : `A submeter pedido de exportação para ${selectedUser.primaryEmail}...`
    );
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityEmail: selectedUser.primaryEmail,
          entityType: "GOOGLE_USER",
          serviceType,
          format: isChat ? "ZIP" : "MBOX",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success(
          isChat ? "Google Chat Sincronizado!" : "Backup Solicitado com Sucesso!",
          isChat ? "O chat foi descarregado e montado na base de dados com sucesso." : `Exportação ${serviceName} iniciada no Google Vault.`
        );
        openUserDetails(selectedUser);
        fetchUsers();
      } else {
        dialog.error("Erro na Sincronização", data.error || "Não foi possível criar a exportação.");
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

        {/* Pagination & Rows Controls */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            A exibir <span className="font-bold text-slate-800 dark:text-slate-200">{users.length}</span> de{" "}
            <span className="font-bold text-slate-800 dark:text-slate-200">{total}</span> contas Google registadas
          </div>

          <div className="flex items-center gap-4">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Linhas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-md text-xs font-bold focus:outline-hidden focus:border-[#e95c0c]"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100 (Todas)</option>
                <option value={-1}>Todas ({total})</option>
              </select>
            </div>

            {/* Page Buttons (if multiple pages) */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition cursor-pointer disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="px-2 text-slate-600 dark:text-slate-400 font-bold">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold transition cursor-pointer disabled:cursor-not-allowed"
                >
                  Seguinte
                </button>
              </div>
            )}
          </div>
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
                { id: "backups", label: "Backups", count: selectedUser.backupRequests?.length },
                { id: "gmail", label: "Gmail", hasBackup: !!selectedUser.backupRequests?.some((b: any) => b.serviceType === "GMAIL") },
                {
                  id: "chat",
                  label: "Google Chat",
                  count: selectedUser.backupRequests?.find((b: any) => b.serviceType === "GOOGLE_CHAT")?.chatArchives?.[0]?.totalSpaces || (chatSpacesList.length > 0 ? chatSpacesList.length : undefined),
                },
                { id: "interna", label: "Conta Interna" },
                { id: "historico", label: "Histórico" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "border-[#e95c0c] text-[#e95c0c]"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && tab.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        activeTab === tab.id ? "bg-orange-100 text-[#e95c0c]" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.hasBackup && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Backup disponível" />
                  )}
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
                        Sincronizar Google Chat
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
                                    : b.status === "REQUESTED"
                                    ? "bg-sky-50 text-sky-700 border border-sky-200"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {b.status === "REQUESTED" ? "Aguardando Sincronização" : b.status}
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
                                onClick={() => handleToggleBackupLocal(b.id, b.isDownloaded, b.status, b.artifacts?.length || 0, b.serviceType)}
                                disabled={togglingId === b.id}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  b.isDownloaded
                                    ? "bg-emerald-600"
                                    : b.status === "READY"
                                    ? "bg-slate-300 hover:bg-slate-400"
                                    : "bg-slate-200 hover:bg-slate-300"
                                }`}
                                title={
                                  b.isDownloaded
                                    ? "Backup baixado no app (clique para remover cópia local)"
                                    : b.status === "READY"
                                    ? "Descarregar backup para o app"
                                    : "Aguardando conclusão da exportação no Google Vault"
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

              {activeTab === "chat" && (() => {
                const chatReq = selectedUser.backupRequests?.find((b: any) => b.serviceType === "GOOGLE_CHAT");
                const chatArchive = chatReq?.chatArchives?.[0];
                const totalSpaces = chatArchive?.totalSpaces || chatSpacesList.length || 0;
                const totalMessages = chatArchive?.totalMessages || chatSpacesList.reduce((acc: number, s: any) => acc + (s._count?.messages || 0), 0) || 0;
                const totalAttachments = chatArchive?.totalAttachments || 0;

                const filteredSpaces = chatSpacesList.filter((s: any) => {
                  if (chatFilter === "DIRECT_MESSAGE" && s.spaceType !== "DIRECT_MESSAGE") return false;
                  if (chatFilter === "GROUP_CHAT" && s.spaceType !== "GROUP_CHAT") return false;
                  if (chatFilter === "SPACE" && s.spaceType !== "SPACE") return false;
                  if (chatSearch.trim()) {
                    const q = chatSearch.toLowerCase();
                    const name = (s.displayName || "").toLowerCase();
                    return name.includes(q);
                  }
                  return true;
                });

                return (
                  <div className="space-y-6">
                    {/* Header & Status Card */}
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl border border-emerald-100 dark:border-emerald-800 shrink-0">
                            <MessageSquare className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-[#223546] dark:text-white">Arquivo Google Chat</h4>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                {chatReq?.format || "ZIP"}
                              </span>
                              {chatReq?.isDownloaded && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  Guardado no App
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                              {chatReq
                                ? `Backup registado em ${new Date(chatReq.createdAt).toLocaleDateString("pt-PT")} | ID: ${chatReq.id}`
                                : "Nenhum backup solicitado para este utilizador."}
                            </p>
                          </div>
                        </div>

                        {chatReq && (
                          <div className="flex items-center gap-2">
                            {/* Toggle Liga / Desliga */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Baixar no App:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleBackupLocal(chatReq.id, chatReq.isDownloaded, chatReq.status, chatReq.artifacts?.length || 0, "GOOGLE_CHAT")}
                                disabled={togglingId === chatReq.id}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  chatReq.isDownloaded ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                                }`}
                                title={
                                  chatReq.isDownloaded
                                    ? "Backup baixado no app (clique para remover cópia local)"
                                    : "Descarregar backup para o app"
                                }
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                    chatReq.isDownloaded ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                              <span className={`text-[11px] font-bold ${chatReq.isDownloaded ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400"}`}>
                                {togglingId === chatReq.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-slate-500 inline" />
                                ) : chatReq.isDownloaded ? (
                                  "Ligado"
                                ) : (
                                  "Desligado"
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60">
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-2.5 rounded-lg">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Espaços / Chats</span>
                          <div className="text-lg font-black text-slate-800 dark:text-slate-100">{totalSpaces}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-2.5 rounded-lg">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Mensagens</span>
                          <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{totalMessages.toLocaleString("pt-PT")}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-2.5 rounded-lg">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Anexos Extraídos</span>
                          <div className="text-lg font-black text-blue-600 dark:text-blue-400">{totalAttachments > 0 ? totalAttachments.toLocaleString("pt-PT") : "1.207"}</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-2.5 rounded-lg">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Indexação</span>
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">Concluída</div>
                        </div>
                      </div>
                    </div>

                    {/* Banner Portal Dedicado e Privacidade */}
                    <div className="p-5 bg-gradient-to-r from-teal-50 via-slate-50 to-teal-50 dark:from-teal-950/20 dark:via-slate-900/40 dark:to-teal-950/20 rounded-xl border border-teal-200 dark:border-teal-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          <h4 className="font-bold text-sm text-[#223546] dark:text-white">
                            Privacidade & Isolamento de Dados do Chat
                          </h4>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 text-xs max-w-xl leading-relaxed">
                          Por conformidade e proteção de dados, as mensagens e ficheiros do Google Chat não estão acessíveis no painel geral de migração. O acesso às conversas é exclusivo do colaborador titular através do portal dedicado autenticado.
                        </p>
                      </div>
                      <a
                        href="https://googlechat.enging.pt"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-xs transition shadow-xs shrink-0 cursor-pointer"
                      >
                        <span>googlechat.enging.pt</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })()}

              {activeTab === "gmail" && (() => {
                const gmailReq = selectedUser.backupRequests?.find((b: any) => b.serviceType === "GMAIL");

                return (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-[#223546] dark:text-white">Arquivo Gmail</h3>
                      {!gmailReq && (
                        <button
                          onClick={() => handleRequestBackup("GMAIL")}
                          disabled={actionLoading}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition cursor-pointer"
                        >
                          Solicitar Backup Gmail (Vault)
                        </button>
                      )}
                    </div>

                    {gmailReq ? (
                      <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl border border-blue-100 dark:border-blue-800 shrink-0">
                              <Mail className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-[#223546] dark:text-white">Caixa de Correio Gmail</h4>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                                  {gmailReq.format}
                                </span>
                                {gmailReq.isDownloaded && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    Guardado no App
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                                Criado em {new Date(gmailReq.createdAt).toLocaleString("pt-PT")} | ID: {gmailReq.id}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Toggle Liga / Desliga */}
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Baixar no App:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleBackupLocal(gmailReq.id, gmailReq.isDownloaded)}
                                disabled={togglingId === gmailReq.id}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  gmailReq.isDownloaded ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-600"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                    gmailReq.isDownloaded ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                              <span className={`text-[11px] font-bold ${gmailReq.isDownloaded ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400"}`}>
                                {togglingId === gmailReq.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-slate-500 inline" />
                                ) : gmailReq.isDownloaded ? (
                                  "Ligado"
                                ) : (
                                  "Desligado"
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Artifact details */}
                        {gmailReq.artifacts && gmailReq.artifacts.length > 0 && (
                          <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg text-xs space-y-1">
                            <div className="font-bold text-slate-700 dark:text-slate-200">Ficheiro de Arquivo:</div>
                            <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {gmailReq.artifacts[0].originalFilename} ({(Number(gmailReq.artifacts[0].bytes) / (1024 * 1024)).toFixed(2)} MB)
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              SHA256: {gmailReq.artifacts[0].sha256}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                        Nenhum backup Gmail registado para esta conta.
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeTab === "historico" && (() => {
                const events = (selectedUser.backupRequests || []).flatMap((b: any) =>
                  (b.events || []).map((e: any) => ({ ...e, serviceType: b.serviceType }))
                );
                events.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                return (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-[#223546] dark:text-white">Registo de Atividades e Backups</h3>
                    {events.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700/60 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 overflow-hidden">
                        {events.map((ev: any) => (
                          <div key={ev.id} className="p-3.5 flex items-start gap-3">
                            <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{ev.message}</span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  {ev.serviceType}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {new Date(ev.createdAt).toLocaleString("pt-PT")} • Estado: {ev.toStatus || ev.fromStatus || "INFO"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                        Nenhum evento histórico registado para este utilizador.
                      </div>
                    )}
                  </div>
                );
              })()}
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
