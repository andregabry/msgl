"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Cloud,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Mail,
  UserCheck,
  AlertCircle,
  X,
  FolderArchive,
  Clock,
  User,
  Shield,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export default function MicrosoftAccountsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modal State
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"resumo" | "backups" | "exchange" | "interna" | "historico">("resumo");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / (pageSize === -1 ? total || 1 : pageSize)));

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const limitParam = pageSize === -1 ? "all" : pageSize;
      const res = await fetch(
        `/api/microsoft/users?page=${page}&limit=${limitParam}&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Erro ao carregar utilizadores Microsoft:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, pageSize, search]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleSync = async () => {
    setSyncing(true);
    showLoading("A Sincronizar Microsoft Entra ID...", "A consultar Microsoft Graph API (/v1.0/users)...");
    try {
      const res = await fetch("/api/microsoft/users", { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Sincronização Concluída!", `Total de utilizadores sincronizados: ${data.totalSynced}`);
        fetchUsers();
      } else {
        dialog.error("Erro na Sincronização Microsoft", data.error || "Não foi possível sincronizar utilizadores.");
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
    showLoading("A Varrer Ficheiros no Disco...", "A detetar ficheiros de backup (PST, MBOX, ZIP) no armazenamento...");
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

  const openUserDetails = async (userSummary: any) => {
    setSelectedUser(userSummary);
    setActiveTab("resumo");
    setActionMessage(null);
    try {
      const res = await fetch(`/api/microsoft/users/${userSummary.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUser(data.user);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBackupLocal = async (
    backupId: string,
    currentIsDownloaded: boolean,
    status?: string,
    artifactsCount?: number
  ) => {
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

  const handleActivateInternal = async () => {
    if (!selectedUser) return;
    const displayName = selectedUser.displayName || selectedUser.mail || selectedUser.userPrincipalName;
    const confirmed = await confirmAction({
      title: "Ativar como Utilizador da Plataforma?",
      text: `O colaborador Microsoft ${displayName} receberá permissão para iniciar sessão na aplicação através de SSO ou credenciais dedicadas.`,
      confirmText: "Ativar Acesso do Colaborador",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading("A Ativar Colaborador Microsoft...", "A criar conta de utilizador interno e permissões de acesso...");
    try {
      const res = await fetch("/api/admin/users/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          microsoftUserId: selectedUser.id,
          role: "USER",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Colaborador Ativado!", "Conta interna criada e associada com sucesso ao utilizador Microsoft.");
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

  const pageNumbers = useMemo(() => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (page >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
      }
    }
    return pages;
  }, [page, totalPages]);

  const startRecord = total === 0 ? 0 : pageSize === -1 ? 1 : (page - 1) * pageSize + 1;
  const endRecord = pageSize === -1 ? total : Math.min(page * pageSize, total);

  return (
    <div className="space-y-6 font-body">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] dark:text-slate-100 flex items-center gap-2 font-heading">
            <Cloud className="w-6 h-6 text-sky-600" />
            Contas de Utilizadores Microsoft 365 (Entra ID)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Inventário de utilizadores sincronizados via Microsoft Graph API com autenticação Application-Only.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSyncLocalBackups}
            disabled={syncingLocal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Varrer ficheiros de backup no disco para associar às contas"
          >
            <FolderArchive className={`w-4 h-4 text-sky-400 ${syncingLocal ? "animate-spin" : ""}`} />
            <span>{syncingLocal ? "A Varrer Disco..." : "Sincronizar Backups do Disco"}</span>
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white rounded-xl text-sm font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "A Sincronizar Graph..." : "Sincronizar Graph"}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-[#15202c] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por UPN, nome ou e-mail..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
          Total registado: <span className="font-bold text-[#223546] dark:text-slate-100">{total}</span> utilizadores
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-[#15202c] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden w-full max-w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-xs table-auto">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#101720] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                <th className="py-3 px-3.5 font-heading">Nome de Exibição</th>
                <th className="py-3 px-3.5 font-heading">UPN / E-mail Principal</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Estado</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Conta Interna</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Mailbox Exchange</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Backup</th>
                <th className="py-3 px-3.5 font-heading whitespace-nowrap">Última Sincronização</th>
                <th className="py-3 px-3.5 text-right font-heading whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-sky-600" />
                      <span>A carregar contas Microsoft...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {search ? "Nenhum utilizador encontrado para a pesquisa indicada." : "Nenhuma conta Microsoft sincronizada. Clique em \"Sincronizar Graph\" para carregar as contas."}
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const hasBackup = u.backupRequests?.some((b: any) => b.status === "READY" || b.isDownloaded);
                  const isInternal = !!u.appUser;
                  const hasDiffMail = u.mail && u.mail.toLowerCase() !== u.userPrincipalName.toLowerCase();

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100 max-w-[170px] truncate" title={u.displayName}>
                          {u.displayName || "(Sem nome)"}
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 max-w-[240px] truncate" title={u.userPrincipalName}>
                          {u.userPrincipalName}
                        </div>
                        {hasDiffMail && (
                          <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500 max-w-[240px] truncate" title={u.mail}>
                            {u.mail}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {u.accountEnabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                            <CheckCircle2 className="w-3 h-3" /> Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <XCircle className="w-3 h-3" /> Desativada
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {isInternal ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60" title={`Perfil: ${u.appUser?.role}`}>
                            <UserCheck className="w-3 h-3" /> Ativada
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {u.mailbox ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.mailbox.recipientType === "SHARED_MAILBOX"
                              ? "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60"
                              : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60"
                          }`}>
                            <Mail className="w-3 h-3" /> {u.mailbox.recipientType === "SHARED_MAILBOX" ? "Shared" : "User"}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {hasBackup ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Pronto
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openUserDetails(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
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

        {/* Pagination Bar */}
        <div className="bg-slate-50/70 dark:bg-[#101720] px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          {/* Left: Summary */}
          <div className="text-slate-500 dark:text-slate-400 font-medium">
            {total > 0 ? (
              <>
                A mostrar <strong className="text-slate-800 dark:text-slate-200">{startRecord}</strong>–<strong className="text-slate-800 dark:text-slate-200">{endRecord}</strong> de{" "}
                <strong className="text-slate-800 dark:text-slate-200">{total}</strong> utilizadores Microsoft
              </>
            ) : (
              "Nenhum registo a apresentar"
            )}
          </div>

          {/* Right: Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Linhas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold focus:outline-none focus:border-sky-500 transition cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>Todas ({total})</option>
              </select>
            </div>

            {/* Navigation buttons */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Primeira página"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Página anterior"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                {/* Page numbers */}
                <div className="hidden sm:flex items-center gap-1">
                  {pageNumbers.map((p, idx) =>
                    p === "..." ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">
                        …
                      </span>
                    ) : (
                      <button
                        key={`page-${p}`}
                        type="button"
                        onClick={() => setPage(p as number)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                          page === p
                            ? "bg-sky-600 text-white shadow-xs"
                            : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>

                <span className="sm:hidden px-2 text-slate-600 dark:text-slate-400 font-bold">
                  {page} / {totalPages}
                </span>

                <button
                  type="button"
                  title="Página seguinte"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <span>Seguinte</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Última página"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* DETAILED MODAL / DRAWER: CONTA MICROSOFT 365                        */}
      {/* ------------------------------------------------------------------- */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#101720]">
              <div>
                <h2 className="text-lg font-black text-[#223546] dark:text-slate-100 flex items-center gap-2">
                  <Cloud className="w-5 h-5 text-sky-600" />
                  {selectedUser.displayName || selectedUser.mail || "Detalhes da Conta Microsoft 365"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{selectedUser.userPrincipalName}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202c] px-6 overflow-x-auto">
              {[
                { id: "resumo", label: "Resumo" },
                { id: "backups", label: "Backups", count: selectedUser.backupRequests?.length },
                { id: "exchange", label: "Caixa Exchange", hasMailbox: !!selectedUser.mailbox },
                { id: "interna", label: "Conta Interna" },
                { id: "historico", label: "Histórico" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === tab.id
                      ? "border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && tab.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        activeTab === tab.id ? "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.hasMailbox && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Mailbox associada" />
                  )}
                </button>
              ))}
            </div>

            {/* Action Alert Banner */}
            {actionMessage && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionMessage}</span>
              </div>
            )}

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs font-body">
              {activeTab === "resumo" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Microsoft Object ID (Provider ID)</span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 break-all">{selectedUser.providerId}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">User Principal Name (UPN)</span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 break-all">{selectedUser.userPrincipalName}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Endereço de E-mail Primário</span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800">{selectedUser.mail || "Não configurado"}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Tipo de Utilizador</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 font-bold">{selectedUser.userType || "Member"}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Estado no Entra ID</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      {selectedUser.accountEnabled ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Conta Ativa no Inquilino
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                          <XCircle className="w-3.5 h-3.5" /> Conta Bloqueada / Desativada
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Última Sincronização Graph</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      {selectedUser.lastSyncedAt ? new Date(selectedUser.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "backups" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100">Backups e Arquivos Associados</h3>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {selectedUser.backupRequests && selectedUser.backupRequests.length > 0 ? (
                      selectedUser.backupRequests.map((b: any) => (
                        <div key={b.id} className="p-3.5 bg-white dark:bg-[#15202c] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                              <span>{b.serviceType}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{b.format}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  b.status === "READY"
                                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                    : b.status === "REMOVED_LOCAL"
                                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                    : "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                                }`}
                              >
                                {b.status === "READY" ? "Pronto" : b.status}
                              </span>
                              {b.isDownloaded && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  Guardado no App
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Criado em {new Date(b.createdAt).toLocaleString("pt-PT")} | ID: {b.id}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#101720] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Baixar no App:</span>
                              <button
                                type="button"
                                onClick={() => handleToggleBackupLocal(b.id, b.isDownloaded, b.status, b.artifacts?.length || 0)}
                                disabled={togglingId === b.id}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                  b.isDownloaded
                                    ? "bg-emerald-600"
                                    : "bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
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
                                  b.isDownloaded ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400"
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
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 text-sky-700 dark:text-sky-300 font-bold text-xs transition border border-sky-200 dark:border-sky-800"
                              >
                                <Download className="w-3.5 h-3.5" /> Transferir
                              </a>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400">Nenhum backup associado a este utilizador no sistema.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "exchange" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-sky-600" />
                    Caixa de Correio Exchange Online
                  </h3>

                  {selectedUser.mailbox ? (
                    <div className="p-4 bg-slate-50 dark:bg-[#101720] rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Endereço SMTP Primário</span>
                          <div className="font-mono text-slate-800 dark:text-slate-200 font-bold">{selectedUser.mailbox.primarySmtpAddress}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Tipo de Caixa</span>
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              selectedUser.mailbox.recipientType === "SHARED_MAILBOX"
                                ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                                : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
                            }`}>
                              {selectedUser.mailbox.recipientType === "SHARED_MAILBOX" ? "Shared Mailbox" : "User Mailbox"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Arquivo Online</span>
                          <div className="text-slate-700 dark:text-slate-300 font-medium">
                            {selectedUser.mailbox.archiveEnabled ? "Ativado" : "Desativado"}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Mapeamentos de Migração</span>
                          <div className="text-slate-700 dark:text-slate-300 font-medium">
                            {selectedUser.mailbox.migrationMappings && selectedUser.mailbox.migrationMappings.length > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                Mapeada com Google Group: {selectedUser.mailbox.migrationMappings[0]?.sourceGroup?.email || "Associado"}
                              </span>
                            ) : (
                              "Nenhum grupo mapeado diretamente como destino"
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      Esta conta Entra ID não possui uma caixa de correio Exchange Online registada na sincronização.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "interna" && (
                <div className="space-y-4">
                  <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100">Associação com Conta Interna da Plataforma</h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                    A ativação desta conta permite que o colaborador aceda à plataforma através do Microsoft Entra ID (SSO) ou através do Portal com as suas credenciais.
                  </p>

                  <div className="p-4 bg-slate-50 dark:bg-[#101720] rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedUser.appUser
                          ? `Ativa como: ${selectedUser.appUser.displayName || selectedUser.appUser.email}`
                          : "Conta interna ainda não ativada"}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {selectedUser.appUser
                          ? `Perfil RBAC: ${selectedUser.appUser.role} • Estado: ${selectedUser.appUser.isActive ? "Ativo" : "Desativado"}`
                          : "O colaborador não conseguirá iniciar sessão até que a conta seja ativada."}
                      </div>
                    </div>

                    <button
                      onClick={handleActivateInternal}
                      disabled={actionLoading}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white rounded-lg font-bold text-xs transition cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {selectedUser.appUser ? "Revalidar Ativação" : "Ativar como utilizador da plataforma"}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "historico" && (() => {
                const events = (selectedUser.backupRequests || []).flatMap((b: any) =>
                  (b.events || []).map((e: any) => ({ ...e, serviceType: b.serviceType }))
                );
                events.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                return (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100">Registo de Atividades e Backups</h3>
                    {events.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#15202c] overflow-hidden">
                        {events.map((ev: any) => (
                          <div key={ev.id} className="p-3.5 flex items-start gap-3">
                            <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{ev.message}</span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
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
                      <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        Nenhum evento histórico registado para este utilizador Microsoft.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101720] flex justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs transition cursor-pointer"
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
