"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Mail,
  Users,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  Database,
  ArrowRightLeft,
  Download,
  AlertCircle,
  X,
  FileSpreadsheet,
  FolderArchive,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import Link from "next/link";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export default function MicrosoftMailboxesPage() {
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [counts, setCounts] = useState<any>({ USER_MAILBOX: 0, SHARED_MAILBOX: 0 });
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Mailbox Details Modal State
  const [selectedMailbox, setSelectedMailbox] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"resumo" | "origem" | "backups" | "migracao" | "historico">("resumo");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Mapping & Migration State
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [selectedSourceGroupEmail, setSelectedSourceGroupEmail] = useState("");
  const [readiness, setReadiness] = useState<any | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / (pageSize === -1 ? total || 1 : pageSize)));

  const fetchMailboxes = async () => {
    setLoading(true);
    try {
      const limitParam = pageSize === -1 ? "all" : pageSize;
      const res = await fetch(
        `/api/microsoft/mailboxes?page=${page}&limit=${limitParam}&type=${typeFilter}&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const data = await res.json();
        setMailboxes(data.mailboxes || []);
        setTotal(data.total || 0);
        setCounts(data.counts || {});
      }
    } catch (err) {
      console.error("Erro ao carregar caixas de correio:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMailboxes();
  }, [page, pageSize, typeFilter, search]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleTypeChange = (type: string) => {
    setTypeFilter(type);
    setPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handleSync = async () => {
    setSyncing(true);
    showLoading("A Sincronizar Mailboxes M365...", "A listar User Mailboxes e Shared Mailboxes via Graph API...");
    try {
      const res = await fetch("/api/microsoft/mailboxes", { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Sincronização Concluída!", `Total de caixas sincronizadas: ${data.totalSynced}`);
        fetchMailboxes();
      } else {
        dialog.error("Erro na Sincronização", data.error || "Não foi possível sincronizar as caixas.");
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
    showLoading("A Varrer Ficheiros no Disco...", "A detetar ficheiros PST e Takeout ZIP no armazenamento...");
    try {
      const res = await fetch("/api/backups/sync-local", { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success(
          "Varredura Concluída!",
          `${data.discoveredCount} ficheiros detetados. ${data.registeredCount} novos registados, ${data.updatedCount} atualizados.`
        );
        fetchMailboxes();
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

  const openMailboxDetails = async (mbx: any) => {
    setSelectedMailbox(mbx);
    setActiveTab("resumo");
    setActionMessage(null);
    setReadiness(null);

    // Initial default source email from existing mapping if any
    const existingGroupEmail = mbx.migrationMappings?.[0]?.sourceGroup?.email || "";
    setSelectedSourceGroupEmail(existingGroupEmail);

    try {
      const res = await fetch(`/api/microsoft/mailboxes/${mbx.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedMailbox(data.mailbox);
        if (data.mailbox.migrationMappings?.[0]?.sourceGroup?.email) {
          setSelectedSourceGroupEmail(data.mailbox.migrationMappings[0].sourceGroup.email);
        }
      }

      // Load all Google Groups for mapping selection
      const grpRes = await fetch(`/api/google/groups?limit=all`);
      if (grpRes.ok) {
        const grpData = await grpRes.json();
        setAvailableGroups(grpData.groups || []);
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
          if (selectedMailbox) openMailboxDetails(selectedMailbox);
          fetchMailboxes();
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
          if (selectedMailbox) openMailboxDetails(selectedMailbox);
          fetchMailboxes();
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

  const handleCheckReadiness = async () => {
    if (!selectedMailbox || !selectedSourceGroupEmail) {
      toast.warning("Selecione um Grupo Google", "Por favor, indique um Grupo Google de origem para validar.");
      return;
    }
    setActionLoading(true);
    showLoading("A Validar Pré-Requisitos...", "A verificar existência de backup PST e conformidade da mailbox...");
    try {
      const res = await fetch(
        `/api/migration/readiness?sourceEmail=${encodeURIComponent(selectedSourceGroupEmail)}&targetEmail=${encodeURIComponent(selectedMailbox.primarySmtpAddress)}&scope=GROUPS`
      );
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        setReadiness(data);
        if (data.ready) {
          toast.success("Validação Concluída!", "Todos os pré-requisitos técnicos foram satisfeitos.");
        } else {
          toast.warning("Avisos de Conformidade", "Verifique os pontos pendentes antes de prosseguir.");
        }
      } else {
        dialog.error("Erro de Validação", data.error || "Falha na verificação de conformidade.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha na Validação", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrepareMigration = async () => {
    if (!selectedMailbox || !selectedSourceGroupEmail) {
      toast.warning("Selecione um Grupo Google", "Por favor, indique um Grupo Google de origem.");
      return;
    }

    const confirmed = await confirmAction({
      title: "Preparar Migração Microsoft Purview?",
      text: `Deseja gerar o ficheiro oficial de mapeamento CSV e preparar o lote do grupo ${selectedSourceGroupEmail} para a caixa ${selectedMailbox.primarySmtpAddress}?`,
      confirmText: "Sim, Preparar Migração",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading("A Preparar Migração...", "A gerar ficheiro CSV oficial do Purview e registo de trabalho...");
    try {
      const res = await fetch("/api/migration/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEmail: selectedSourceGroupEmail,
          targetEmail: selectedMailbox.primarySmtpAddress,
          groupEmail: selectedSourceGroupEmail,
          targetMailboxEmail: selectedMailbox.primarySmtpAddress,
          scope: "GROUPS",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        dialog.success(
          "Migração Preparada com Sucesso!",
          `O trabalho foi criado e o manifesto CSV oficial do Microsoft Purview foi gerado. Aceda ao separador 'Migração' ou consulte a aba 'Trabalhos de Migração'.`
        );
        openMailboxDetails(selectedMailbox);
        fetchMailboxes();
      } else {
        dialog.error("Erro na Preparação", data.error || "Não foi possível preparar o pacote.");
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
            <Mail className="w-6 h-6 text-sky-600" />
            Caixas de Correio Microsoft 365 (Exchange Online)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Mapeamento e inventário de User Mailboxes e Shared Mailboxes para destino de migração de Google Groups.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSyncLocalBackups}
            disabled={syncingLocal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Varrer ficheiros PST e Takeout no disco para associar às caixas"
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
            <span>{syncing ? "A Sincronizar Mailboxes..." : "Sincronizar Mailboxes"}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => handleTypeChange("ALL")}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            typeFilter === "ALL"
              ? "bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-700 ring-2 ring-sky-500/20"
              : "bg-white dark:bg-[#15202c] border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">Total Mailboxes</div>
          <div className="text-2xl font-black text-[#223546] dark:text-slate-100 mt-1 font-heading">
            {(counts.USER_MAILBOX || 0) + (counts.SHARED_MAILBOX || 0)}
          </div>
        </div>

        <div
          onClick={() => handleTypeChange("SHARED_MAILBOX")}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            typeFilter === "SHARED_MAILBOX"
              ? "bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-700 ring-2 ring-sky-500/20"
              : "bg-white dark:bg-[#15202c] border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-600" />
            Shared Mailboxes (Destino Preferencial)
          </div>
          <div className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 font-heading">{counts.SHARED_MAILBOX || 0}</div>
        </div>

        <div
          onClick={() => handleTypeChange("USER_MAILBOX")}
          className={`p-4 rounded-xl border cursor-pointer transition ${
            typeFilter === "USER_MAILBOX"
              ? "bg-sky-50 dark:bg-sky-950/40 border-sky-400 dark:border-sky-700 ring-2 ring-sky-500/20"
              : "bg-white dark:bg-[#15202c] border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-heading">User Mailboxes</div>
          <div className="text-2xl font-black text-slate-700 dark:text-slate-300 mt-1 font-heading">{counts.USER_MAILBOX || 0}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-[#15202c] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por endereço SMTP ou nome..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 transition"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
          Filtro ativo: <span className="font-bold text-[#223546] dark:text-slate-100">{total}</span> caixas
        </div>
      </div>

      {/* Mailboxes Table */}
      <div className="bg-white dark:bg-[#15202c] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto w-full max-w-full">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#101720] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                <th className="py-3 px-3.5 font-heading whitespace-nowrap">Endereço SMTP Primário</th>
                <th className="py-3 px-3.5 font-heading whitespace-nowrap">Nome de Exibição</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Tipo de Destino</th>
                <th className="py-3 px-3.5 font-heading whitespace-nowrap">Origem Google Group</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Backup / PST</th>
                <th className="py-3 px-3.5 text-center font-heading whitespace-nowrap">Estado Migração</th>
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
                      <span>A carregar caixas de correio...</span>
                    </div>
                  </td>
                </tr>
              ) : mailboxes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    {search ? "Nenhuma caixa encontrada com os termos de pesquisa." : "Nenhuma caixa encontrada. Execute a sincronização com o Exchange Online."}
                  </td>
                </tr>
              ) : (
                mailboxes.map((m) => {
                  const mapping = m.migrationMappings?.[0];
                  const job = m.migrationJobs?.[0];
                  const hasDirectBackup = m.directBackups?.some((b: any) => b.status === "READY" || b.isDownloaded);
                  const hasSourceBackup = mapping?.sourceGroup?.backupRequests?.some((b: any) => b.status === "READY" || b.isDownloaded);
                  const hasBackup = hasDirectBackup || hasSourceBackup;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3.5">
                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100 max-w-[220px] truncate" title={m.primarySmtpAddress}>
                          {m.primarySmtpAddress}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-slate-700 dark:text-slate-300">
                        <div className="max-w-[170px] truncate" title={m.displayName || "—"}>
                          {m.displayName || "—"}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {m.recipientType === "SHARED_MAILBOX" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                            <Users className="w-3 h-3" /> Shared Mailbox
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            User Mailbox
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        {mapping?.sourceGroup ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold font-mono text-[11px] max-w-[210px] truncate" title={mapping.sourceGroup.email}>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{mapping.sourceGroup.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic whitespace-nowrap">Disponível para mapeamento</span>
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
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {job ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : job.status === "AWAITING_PURVIEW_JOB" || job.status === "QUEUED"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : job.status === "FAILED"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                            }`}
                          >
                            {job.status}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Não iniciado</span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap">
                        {m.lastSyncedAt ? new Date(m.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                      </td>
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => openMailboxDetails(m)}
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
                <strong className="text-slate-800 dark:text-slate-200">{total}</strong> caixas Exchange
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
      {/* DETAILED MODAL: CAIXA DE CORREIO MICROSOFT 365                      */}
      {/* ------------------------------------------------------------------- */}
      {selectedMailbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#101720]">
              <div>
                <h2 className="text-lg font-black text-[#223546] dark:text-slate-100 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-sky-600" />
                  {selectedMailbox.displayName || selectedMailbox.primarySmtpAddress}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{selectedMailbox.primarySmtpAddress}</p>
              </div>
              <button
                onClick={() => setSelectedMailbox(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202c] px-6 overflow-x-auto">
              {[
                { id: "resumo", label: "Resumo" },
                { id: "origem", label: "Origem & Mapeamento", count: selectedMailbox.migrationMappings?.length },
                {
                  id: "backups",
                  label: "Backups & PSTs",
                  count: (selectedMailbox.directBackups?.length || 0) + (selectedMailbox.migrationMappings?.[0]?.sourceGroup?.backupRequests?.length || 0),
                },
                { id: "migracao", label: "Trabalhos de Migração", count: selectedMailbox.migrationJobs?.length },
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
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Exchange Mailbox Provider ID</span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 break-all">{selectedMailbox.providerMailboxId}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Endereço SMTP Primário</span>
                    <div className="font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 font-bold">{selectedMailbox.primarySmtpAddress}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Nome de Exibição</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 font-bold">{selectedMailbox.displayName}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Tipo de Destino Exchange</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedMailbox.recipientType === "SHARED_MAILBOX"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                          : "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
                      }`}>
                        {selectedMailbox.recipientType === "SHARED_MAILBOX" ? "Shared Mailbox (Caixa Partilhada)" : "User Mailbox (Caixa de Utilizador)"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Arquivo Online</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800 font-medium">
                      {selectedMailbox.archiveEnabled ? "Ativado no Exchange Online" : "Desativado"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Última Sincronização Exchange</span>
                    <div className="text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#101720] p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                      {selectedMailbox.lastSyncedAt ? new Date(selectedMailbox.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "origem" && (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                    <h3 className="font-black text-sm text-[#223546] dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4 text-sky-600" />
                      Mapeamento com Google Workspace Group
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Selecione o Grupo Google de origem correspondente para associar a esta caixa de destino Microsoft 365, validar os pré-requisitos técnicos e gerar o manifesto oficial do Microsoft Purview.
                    </p>

                    <div className="space-y-2 pt-2">
                      <label className="font-bold text-slate-700 dark:text-slate-300 text-xs">Grupo Google de Origem:</label>
                      <select
                        value={selectedSourceGroupEmail}
                        onChange={(e) => setSelectedSourceGroupEmail(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-[#15202c] text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500 transition cursor-pointer"
                      >
                        <option value="">-- Selecione o Grupo Google de Origem --</option>
                        {availableGroups.map((g) => (
                          <option key={g.id} value={g.email}>
                            {g.name} &lt;{g.email}&gt; ({g.directMembersCount} membros)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        onClick={handleCheckReadiness}
                        disabled={actionLoading || !selectedSourceGroupEmail}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs transition cursor-pointer disabled:opacity-50"
                      >
                        Validar Requisitos (Readiness)
                      </button>
                      <button
                        onClick={handlePrepareMigration}
                        disabled={actionLoading || !selectedSourceGroupEmail}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Preparar Migração & Gerar CSV Purview</span>
                      </button>
                    </div>
                  </div>

                  {/* Readiness Checklist */}
                  {readiness && (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-[#15202c] space-y-3">
                      <h4 className="font-bold text-xs text-[#223546] dark:text-slate-100 uppercase tracking-wider">
                        Verificação de Prontidão (Migration Readiness Checklist)
                      </h4>
                      <div className="space-y-2">
                        {readiness.checks?.map((c: any) => (
                          <div key={c.key} className="flex items-start gap-2.5 text-xs">
                            {c.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${c.isMandatory ? "text-rose-500" : "text-amber-500"}`} />
                            )}
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{c.label}:</span>{" "}
                              <span className="text-slate-600 dark:text-slate-400">{c.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "backups" && (() => {
                const sourceBackups = selectedMailbox.migrationMappings?.[0]?.sourceGroup?.backupRequests || [];
                const directBackups = selectedMailbox.directBackups || [];
                const allBackups = [...directBackups, ...sourceBackups];

                return (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100">Backups e Ficheiros PST Associados</h3>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {allBackups.length > 0 ? (
                        allBackups.map((b: any) => (
                          <div key={b.id} className="p-3.5 bg-white dark:bg-[#15202c] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                <span>Formato {b.format}</span>
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
                                Conta: {b.entityEmail} | ID: {b.id} | {new Date(b.createdAt).toLocaleString("pt-PT")}
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
                                    b.isDownloaded ? "bg-emerald-600" : "bg-slate-300 dark:bg-slate-700 hover:bg-slate-400"
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
                        <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                          Nenhum backup PST encontrado para esta caixa ou para o grupo de origem mapeado.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {activeTab === "migracao" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100">Trabalhos de Migração (Migration Jobs)</h3>
                    <Link
                      href="/migration"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700"
                    >
                      <span>Ir para Centro de Migração</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    {selectedMailbox.migrationJobs && selectedMailbox.migrationJobs.length > 0 ? (
                      selectedMailbox.migrationJobs.map((job: any) => (
                        <div key={job.id} className="p-4 bg-white dark:bg-[#15202c] space-y-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                              Lote / Job ID: {job.id}
                            </div>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold self-start ${
                                job.status === "COMPLETED"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : job.status === "AWAITING_PURVIEW_JOB" || job.status === "QUEUED"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                  : job.status === "FAILED"
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                  : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                              }`}
                            >
                              {job.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                            <div>
                              Origem: <strong className="text-slate-700 dark:text-slate-300 font-mono">{job.sourceEmail}</strong>
                            </div>
                            <div>
                              Destino: <strong className="text-slate-700 dark:text-slate-300 font-mono">{job.targetEmail}</strong>
                            </div>
                            <div>
                              Itens: <strong className="text-slate-700 dark:text-slate-300">{job.migratedItemsCount || 0} / {job.totalItemsCount || 0}</strong>
                            </div>
                            <div>
                              Criado em: <strong className="text-slate-700 dark:text-slate-300">{new Date(job.createdAt).toLocaleString("pt-PT")}</strong>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        Nenhum trabalho de migração executado para esta caixa até ao momento.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "historico" && (() => {
                const events = (selectedMailbox.migrationJobs || []).flatMap((j: any) =>
                  (j.events || []).map((e: any) => ({ ...e, jobId: j.id }))
                );
                events.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                return (
                  <div className="space-y-4">
                    <h3 className="font-bold text-sm text-[#223546] dark:text-slate-100">Histórico de Eventos e Auditoria</h3>
                    {events.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-[#15202c] overflow-hidden">
                        {events.map((ev: any) => (
                          <div key={ev.id} className="p-3.5 flex items-start gap-3">
                            <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{ev.message}</span>
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                                  {ev.toStatus || ev.fromStatus || "INFO"}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {new Date(ev.createdAt).toLocaleString("pt-PT")} • Job: {ev.jobId}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        Nenhum evento histórico registado para esta caixa de correio.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#101720] flex justify-end">
              <button
                onClick={() => setSelectedMailbox(null)}
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
