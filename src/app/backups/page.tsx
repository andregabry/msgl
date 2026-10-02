"use client";

import React, { useEffect, useState } from "react";
import {
  Database,
  Search,
  RefreshCw,
  Eye,
  Download,
  UploadCloud,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FolderInput,
  X,
  HardDrive,
} from "lucide-react";

export default function BackupsPage() {
  const [backups, setBackups] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalStorageBytes, setTotalStorageBytes] = useState("0");
  const [page, setPage] = useState(1);
  const [serviceFilter, setServiceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFilePath, setImportFilePath] = useState("");
  const [importEmail, setImportEmail] = useState("");
  const [importEntityType, setImportEntityType] = useState("GOOGLE_GROUP");
  const [importServiceType, setImportServiceType] = useState("GOOGLE_GROUPS");
  const [importFormat, setImportFormat] = useState("PST");
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Backup Details Modal
  const [selectedBackup, setSelectedBackup] = useState<any | null>(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/backups?page=${page}&limit=20&serviceType=${serviceFilter}&status=${statusFilter}&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const data = await res.json();
        setBackups(data.backups || []);
        setTotal(data.total || 0);
        setTotalStorageBytes(data.totalStorageBytes || "0");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, [page, serviceFilter, statusFilter, search]);

  const handleImportLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportLoading(true);
    setImportMessage(null);
    try {
      const res = await fetch("/api/backups/import-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFilePath: importFilePath,
          entityEmail: importEmail,
          entityType: importEntityType,
          serviceType: importServiceType,
          format: importFormat,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportMessage("Backup importado com sucesso! Integridade SHA-256 calculada.");
        fetchBackups();
        setTimeout(() => setIsImportModalOpen(false), 1500);
      } else {
        setImportMessage(`Erro: ${data.error}`);
      }
    } catch (err: any) {
      setImportMessage(`Falha: ${err.message}`);
    } finally {
      setImportLoading(false);
    }
  };

  const formatBytes = (bytesStr?: string) => {
    const b = parseInt(bytesStr || "0", 10);
    if (b === 0) return "0 MB";
    const gb = b / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = b / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
            <Database className="w-6 h-6 text-[#e95c0c]" />
            Repositório Central de Backups & Arquivos Físicos
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Gestão de exportações do Google Vault e registo de backups existentes com validação SHA-256 e storage seguro.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
          >
            <FolderInput className="w-4 h-4 text-[#e95c0c]" />
            <span>Importar Backup Existente</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-4 justify-between items-center text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#e95c0c]"
            />
          </div>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="p-1.5 border border-slate-200 rounded-lg bg-white font-medium"
          >
            <option value="ALL">Todos os Serviços</option>
            <option value="GMAIL">Gmail</option>
            <option value="GOOGLE_CHAT">Google Chat</option>
            <option value="GOOGLE_GROUPS">Google Groups</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-1.5 border border-slate-200 rounded-lg bg-white font-medium"
          >
            <option value="ALL">Todos os Estados</option>
            <option value="READY">Pronto (Local)</option>
            <option value="EXPORT_RUNNING">Em Execução (Vault)</option>
            <option value="DOWNLOADING">Em Transferência</option>
            <option value="FAILED">Com Erro</option>
          </select>
        </div>

        <div className="flex items-center gap-4 text-slate-500 font-semibold">
          <div>
            Total: <span className="font-bold text-[#223546]">{total}</span> backups
          </div>
          <div>
            Espaço: <span className="font-bold text-[#223546]">{formatBytes(totalStorageBytes)}</span>
          </div>
        </div>
      </div>

      {/* Backups Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Entidade / Conta</th>
                <th className="py-3 px-4">Serviço</th>
                <th className="py-3 px-4 text-center">Formato</th>
                <th className="py-3 px-4 text-center">Origem</th>
                <th className="py-3 px-4 text-center">Tamanho</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4">Data do Pedido</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    A carregar backups...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum backup registado nos filtros selecionados.
                  </td>
                </tr>
              ) : (
                backups.map((b) => {
                  const artifact = b.artifacts?.[0];
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.entityEmail}</td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{b.serviceType}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {b.format}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {artifact?.origin || "GOOGLE_VAULT"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-[#223546]">
                        {formatBytes(artifact?.bytes)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            b.status === "READY"
                              ? "bg-emerald-100 text-emerald-800"
                              : b.status === "FAILED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(b.createdAt).toLocaleString("pt-PT")}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => setSelectedBackup(b)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition cursor-pointer"
                        >
                          Ver
                        </button>
                        {artifact && (
                          <a
                            href={`/api/backups/${artifact.id}/download`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-bold transition"
                          >
                            <Download className="w-3 h-3" /> Transferir
                          </a>
                        )}
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
      {/* MODAL: IMPORTAR BACKUP EXISTENTE                                    */}
      {/* ------------------------------------------------------------------- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-[#223546] flex items-center gap-2">
                <FolderInput className="w-5 h-5 text-[#e95c0c]" />
                Importar Backup Local Existente
              </h2>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {importMessage && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800">
                {importMessage}
              </div>
            )}

            <form onSubmit={handleImportLocal} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Caminho Absoluto do Ficheiro (MBOX / PST / ZIP):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: C:\Users\andre.gabry\Projects\m365\backup.pst"
                  value={importFilePath}
                  onChange={(e) => setImportFilePath(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">E-mail da Entidade / Grupo / Conta:</label>
                <input
                  type="email"
                  required
                  placeholder="informatica@enging.pt"
                  value={importEmail}
                  onChange={(e) => setImportEmail(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Tipo de Entidade:</label>
                  <select
                    value={importEntityType}
                    onChange={(e) => setImportEntityType(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="GOOGLE_GROUP">Google Group</option>
                    <option value="GOOGLE_USER">Google User</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Serviço:</label>
                  <select
                    value={importServiceType}
                    onChange={(e) => setImportServiceType(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="GOOGLE_GROUPS">Google Groups</option>
                    <option value="GMAIL">Gmail</option>
                    <option value="GOOGLE_CHAT">Google Chat</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Formato:</label>
                <select
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="PST">PST (Outlook / Purview)</option>
                  <option value="MBOX">MBOX (Unix Mailbox)</option>
                  <option value="ZIP">ZIP (Takeout Archive)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importLoading}
                  className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg font-bold"
                >
                  {importLoading ? "A Importar & Validar..." : "Registar Backup Local"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: DETALHES DO BACKUP COM TIMELINE                              */}
      {/* ------------------------------------------------------------------- */}
      {selectedBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-[#223546]">
                  Detalhes do Backup: {selectedBackup.entityEmail}
                </h2>
                <p className="text-xs text-slate-400 font-mono">ID: {selectedBackup.id}</p>
              </div>
              <button
                onClick={() => setSelectedBackup(null)}
                className="w-7 h-7 rounded hover:bg-slate-100 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="font-bold text-slate-400">Serviço / Formato:</span>
                  <div className="font-bold text-slate-800">{selectedBackup.serviceType} ({selectedBackup.format})</div>
                </div>
                <div>
                  <span className="font-bold text-slate-400">Estado Atual:</span>
                  <div className="font-bold text-[#e95c0c]">{selectedBackup.status}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-400">Solicitado Por:</span>
                  <div className="text-slate-800">{selectedBackup.requestedBy || "Sistema"}</div>
                </div>
                <div>
                  <span className="font-bold text-slate-400">Tamanho no Storage:</span>
                  <div className="font-bold text-slate-800">{formatBytes(selectedBackup.artifacts?.[0]?.bytes)}</div>
                </div>
                <div className="col-span-2">
                  <span className="font-bold text-slate-400">Integridade SHA-256:</span>
                  <div className="font-mono text-[10px] text-slate-700 bg-white p-1 rounded border border-slate-200">
                    {selectedBackup.artifacts?.[0]?.sha256 || "Aguardando download"}
                  </div>
                </div>
              </div>

              {/* Event Timeline */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs text-[#223546] uppercase tracking-wider">Histórico de Eventos</h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {selectedBackup.events && selectedBackup.events.length > 0 ? (
                    selectedBackup.events.map((e: any) => (
                      <div key={e.id} className="p-2.5 bg-white flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800">{e.toStatus}</span>
                          <span className="text-slate-500 pl-2">{e.message}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{new Date(e.createdAt).toLocaleTimeString("pt-PT")}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-slate-400">Nenhum evento registado.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedBackup(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs"
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
