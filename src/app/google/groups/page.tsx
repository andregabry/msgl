"use client";

import React, { useEffect, useState } from "react";
import {
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
} from "lucide-react";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export default function GoogleGroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingLocal, setSyncingLocal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Group Details Modal State
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"resumo" | "membros" | "backups" | "migracao" | "historico">("resumo");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Migration Tab State
  const [targetMailboxEmail, setTargetMailboxEmail] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any | null>(null);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/google/groups?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Erro ao carregar grupos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [page, search]);

  const handleSync = async () => {
    setSyncing(true);
    showLoading("A Sincronizar Grupos...", "A consultar Google Admin SDK Directory API...");
    try {
      const res = await fetch("/api/google/groups", { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Sincronização Concluída!", `Total de grupos sincronizados: ${data.totalSynced}`);
        fetchGroups();
      } else {
        dialog.error("Erro na Sincronização", data.error || "Não foi possível sincronizar os grupos.");
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
        fetchGroups();
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
          if (selectedGroup) openGroupDetails(selectedGroup);
          fetchGroups();
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
          if (selectedGroup) openGroupDetails(selectedGroup);
          fetchGroups();
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

  const openGroupDetails = async (grp: any) => {
    setSelectedGroup(grp);
    setActiveTab("resumo");
    setActionMessage(null);
    setReadiness(null);
    try {
      const res = await fetch(`/api/google/groups/${grp.id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedGroup(data.group);
      }

      // Fetch target mapping suggestions
      const mapRes = await fetch(`/api/migration/mappings?groupEmail=${encodeURIComponent(grp.email)}`);
      if (mapRes.ok) {
        const mapData = await mapRes.json();
        setSuggestions(mapData.suggestions || []);
        if (mapData.suggestions && mapData.suggestions.length > 0) {
          setTargetMailboxEmail(mapData.suggestions[0].mailbox.primarySmtpAddress);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestVaultBackup = async (format: "PST" | "MBOX") => {
    if (!selectedGroup) return;
    const confirmed = await confirmAction({
      title: `Solicitar Backup do Grupo (${format})?`,
      text: `Será submetida uma exportação oficial no Google Vault para o grupo ${selectedGroup.email}. ${
        format === "PST"
          ? "Formato PST recomendado para a migração para o Microsoft Purview."
          : "Formato MBOX ideal para retenção pura."
      }`,
      confirmText: "Sim, Solicitar Backup",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading("A Criar Exportação no Google Vault...", `A submeter pedido ${format} para ${selectedGroup.email}...`);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityEmail: selectedGroup.email,
          entityType: "GOOGLE_GROUP",
          serviceType: "GOOGLE_GROUPS",
          format,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Backup do Grupo Solicitado!", `Exportação ${format} criada com sucesso no Google Vault.`);
        openGroupDetails(selectedGroup);
      } else {
        dialog.error("Erro ao Solicitar Backup", data.error || "Não foi possível criar a exportação.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckReadiness = async () => {
    if (!selectedGroup || !targetMailboxEmail) return;
    setActionLoading(true);
    showLoading("A Validar Pré-Requisitos...", "A verificar existência de backup PST e conformidade da mailbox...");
    try {
      const res = await fetch(
        `/api/migration/readiness?groupEmail=${encodeURIComponent(selectedGroup.email)}&targetMailbox=${encodeURIComponent(targetMailboxEmail)}`
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
        dialog.error("Erro de Validação", data.error || "Falha na verificação.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha na Validação", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrepareMigration = async () => {
    if (!selectedGroup || !targetMailboxEmail) return;
    const confirmed = await confirmAction({
      title: "Preparar Migração Microsoft Purview?",
      text: `Deseja gerar o ficheiro oficial de mapeamento CSV e preparar o lote para a caixa partilhada ${targetMailboxEmail}?`,
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
          groupEmail: selectedGroup.email,
          targetMailboxEmail,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        dialog.success(
          "Migração Preparada com Sucesso!",
          `O trabalho foi criado e o manifesto CSV oficial do Microsoft Purview foi gerado. Aceda ao separador 'Migração' para concluir o upload.`
        );
        openGroupDetails(selectedGroup);
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

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#e95c0c]" />
            Grupos de Trabalho do Google Workspace
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Inventário de grupos de trabalho, listas de distribuição, backups Google Vault e migração para M365.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSyncLocalBackups}
            disabled={syncingLocal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
            title="Varrer ficheiros PST e Takeout no disco para associar aos grupos"
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
            <span>{syncing ? "A Sincronizar Grupos..." : "Sincronizar Grupos"}</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por nome ou e-mail do grupo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#e95c0c]"
          />
        </div>

        <div className="text-xs text-slate-500 font-semibold">
          Total de grupos sincronizados: <span className="font-bold text-[#223546]">{total}</span>
        </div>
      </div>

      {/* Groups Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Grupo</th>
                <th className="py-3 px-4">E-mail do Grupo</th>
                <th className="py-3 px-4 text-center">Membros</th>
                <th className="py-3 px-4 text-center">Backup</th>
                <th className="py-3 px-4">Destino Microsoft</th>
                <th className="py-3 px-4 text-center">Estado Migração</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    A carregar grupos Google...
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhum grupo encontrado.
                  </td>
                </tr>
              ) : (
                groups.map((g) => {
                  const hasBackup = g.backupRequests?.some((b: any) => b.status === "READY");
                  const mapping = g.migrationMappings?.[0];
                  const job = g.migrationJobs?.[0];

                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{g.name}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">{g.email}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {g.directMembersCount} membros
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasBackup ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Pronto
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {mapping ? mapping.targetEmail : <span className="text-slate-400">Não associado</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {job ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.status === "COMPLETED"
                                ? "bg-emerald-100 text-emerald-800"
                                : job.status === "AWAITING_PURVIEW_JOB"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {job.status}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Não iniciado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openGroupDetails(g)}
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
      {/* DETAILED MODAL: GOOGLE GROUP & MICROSOFT MIGRATION                  */}
      {/* ------------------------------------------------------------------- */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-lg font-black text-[#223546]">{selectedGroup.name}</h2>
                <p className="text-xs text-slate-500 font-mono">{selectedGroup.email}</p>
              </div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 bg-white px-6">
              {[
                { id: "resumo", label: "Resumo" },
                { id: "membros", label: "Membros" },
                { id: "backups", label: "Backups" },
                { id: "migracao", label: "Migração Microsoft" },
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

            {/* Banner */}
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
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Google Group ID</span>
                    <div className="font-mono text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">{selectedGroup.providerId}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Descrição</span>
                    <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">{selectedGroup.description || "(Sem descrição)"}</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Membros Diretos</span>
                    <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">{selectedGroup.directMembersCount} membros</div>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Última Sincronização</span>
                    <div className="text-slate-800 bg-slate-50 p-2 rounded border border-slate-100">
                      {selectedGroup.lastSyncedAt ? new Date(selectedGroup.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "membros" && (
                <div className="space-y-3">
                  <h3 className="font-bold text-sm text-[#223546]">Membros do Grupo</h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {selectedGroup.members && selectedGroup.members.length > 0 ? (
                      selectedGroup.members.map((m: any) => (
                        <div key={m.id} className="p-3 bg-white flex items-center justify-between">
                          <span className="font-mono text-slate-800">{m.email}</span>
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{m.role}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">{m.type}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-400">Nenhum membro sincronizado para este grupo.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "backups" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-[#223546]">Backups Google Vault</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRequestVaultBackup("PST")}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded text-xs font-bold transition cursor-pointer"
                      >
                        Solicitar Backup PST (Recomendado M365)
                      </button>
                      <button
                        onClick={() => handleRequestVaultBackup("MBOX")}
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-bold transition cursor-pointer"
                      >
                        Solicitar Backup MBOX
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                    {selectedGroup.backupRequests && selectedGroup.backupRequests.length > 0 ? (
                      selectedGroup.backupRequests.map((b: any) => (
                        <div key={b.id} className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-2">
                              <span>Formato {b.format}</span>
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
                              ID: {b.id} | {new Date(b.createdAt).toLocaleString("pt-PT")}
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
                      <div className="p-8 text-center text-slate-400">Nenhum backup disponível para este grupo.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "migracao" && (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <h3 className="font-black text-sm text-[#223546] uppercase tracking-wider">
                      Preparação de Migração para Microsoft 365
                    </h3>
                    <p className="text-slate-600">
                      Associe o backup deste grupo a uma caixa de correio do Microsoft 365 (recomenda-se <strong>Shared Mailbox</strong>) e gere o pacote de importação compatível com o Microsoft 365 Purview Import Service.
                    </p>

                    <div className="space-y-2 pt-2">
                      <label className="font-bold text-slate-700 text-xs">Caixa de Correio Microsoft de Destino:</label>
                      <select
                        value={targetMailboxEmail}
                        onChange={(e) => setTargetMailboxEmail(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono bg-white focus:outline-none focus:border-[#e95c0c]"
                      >
                        {suggestions.map((s) => (
                          <option key={s.mailbox.id} value={s.mailbox.primarySmtpAddress}>
                            {s.mailbox.primarySmtpAddress} ({s.mailbox.recipientType === "SHARED_MAILBOX" ? "★ SHARED MAILBOX" : s.mailbox.recipientType}) — Confiança: {s.confidence}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleCheckReadiness}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold text-xs transition cursor-pointer"
                      >
                        Validar Requisitos (Readiness)
                      </button>
                      <button
                        onClick={handlePrepareMigration}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Preparar Migração & Gerar CSV Purview</span>
                      </button>
                    </div>
                  </div>

                  {/* Readiness Checklist */}
                  {readiness && (
                    <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                      <h4 className="font-bold text-xs text-[#223546] uppercase tracking-wider">
                        Verificação de Prontidão (Migration Readiness Checklist)
                      </h4>
                      <div className="space-y-2">
                        {readiness.checks.map((c: any) => (
                          <div key={c.key} className="flex items-start gap-2.5 text-xs">
                            {c.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${c.isMandatory ? "text-rose-500" : "text-amber-500"}`} />
                            )}
                            <div>
                              <span className="font-bold text-slate-800">{c.label}:</span>{" "}
                              <span className="text-slate-600">{c.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "historico" && (
                <div className="p-8 text-center text-slate-400">
                  Histórico completo de auditoria e operações do grupo.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedGroup(null)}
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
