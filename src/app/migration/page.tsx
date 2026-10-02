"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Clock,
  Download,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export default function MigrationHubPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [selectedGroupEmail, setSelectedGroupEmail] = useState("");
  const [selectedMailboxEmail, setSelectedMailboxEmail] = useState("");
  const [readiness, setReadiness] = useState<any | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Migration Jobs List
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Purview Input Modal
  const [activeJobForPurview, setActiveJobForPurview] = useState<any | null>(null);
  const [purviewJobIdInput, setPurviewJobIdInput] = useState("");

  const fetchData = async () => {
    try {
      const [gRes, mRes, jRes] = await Promise.all([
        fetch("/api/google/groups?limit=100"),
        fetch("/api/microsoft/mailboxes?limit=100"),
        fetch("/api/migration/jobs"),
      ]);

      if (gRes.ok) {
        const gData = await gRes.json();
        setGroups(gData.groups || []);
        if (gData.groups?.length > 0 && !selectedGroupEmail) {
          setSelectedGroupEmail(gData.groups[0].email);
        }
      }

      if (mRes.ok) {
        const mData = await mRes.json();
        setMailboxes(mData.mailboxes || []);
        if (mData.mailboxes?.length > 0 && !selectedMailboxEmail) {
          setSelectedMailboxEmail(mData.mailboxes[0].primarySmtpAddress);
        }
      }

      if (jRes.ok) {
        const jData = await jRes.json();
        setJobs(jData.jobs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleValidate = async () => {
    if (!selectedGroupEmail || !selectedMailboxEmail) return;
    setLoadingReadiness(true);
    setReadiness(null);
    setMessage(null);
    showLoading("A Validar Pré-Requisitos...", "A verificar backups locais e integridade da mailbox de destino...");
    try {
      const res = await fetch(
        `/api/migration/readiness?groupEmail=${encodeURIComponent(selectedGroupEmail)}&targetMailbox=${encodeURIComponent(selectedMailboxEmail)}`
      );
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        setReadiness(data);
        if (data.ready) {
          toast.success("Tudo Pronto para Migração!", "Backup PST validado e mailbox Microsoft pronta.");
        } else {
          toast.warning("Pré-requisitos Pendentes", "Consulte o checklist de validação abaixo.");
        }
      } else {
        dialog.error("Erro na Validação", data.error || "Falha na verificação de conformidade.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setLoadingReadiness(false);
    }
  };

  const handlePrepare = async () => {
    if (!selectedGroupEmail || !selectedMailboxEmail) return;
    const confirmed = await confirmAction({
      title: "Preparar Migração Microsoft Purview?",
      text: `Deseja associar o grupo ${selectedGroupEmail} à caixa partilhada ${selectedMailboxEmail} e gerar o manifesto oficial CSV do Microsoft Purview?`,
      confirmText: "Sim, Preparar Pacote",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    setMessage(null);
    showLoading("A Preparar Migração...", "A gerar ficheiro CSV de mapeamento oficial e registo no histórico...");
    try {
      const res = await fetch("/api/migration/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupEmail: selectedGroupEmail,
          targetMailboxEmail: selectedMailboxEmail,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        dialog.success(
          "Migração Preparada com Sucesso!",
          "O lote de migração foi criado e o CSV de mapeamento oficial do Purview foi gerado. Consulte a tabela de trabalhos abaixo para o comando AzCopy."
        );
        fetchData();
      } else {
        dialog.error("Erro ao Preparar Migração", data.error || "Falha na preparação.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerImport = async (jobId: string) => {
    const confirmed = await confirmAction({
      title: "Confirmar Upload AzCopy?",
      text: "Confirma que os ficheiros PST foram enviados com sucesso via AzCopy para o Azure Blob Storage da Microsoft através da SAS URL temporária?",
      confirmText: "Sim, Confirmar Upload",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading("A Registar Estado...", "A atualizar o trabalho para aguardar processamento no Microsoft Purview...");
    try {
      const res = await fetch(`/api/migration/jobs/${jobId}/import`, {
        method: "POST",
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        dialog.info(
          "Aguardando Execução no Purview",
          data.message || "O trabalho está pronto. Aceda ao portal de conformidade do Microsoft Purview para iniciar a análise e importação."
        );
        fetchData();
      } else {
        dialog.error("Erro", data.error || "Não foi possível avançar o estado.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePurviewJobId = async () => {
    if (!activeJobForPurview || !purviewJobIdInput.trim()) return;
    showLoading("A Registar Trabalho...", "A associar o ID de Trabalho do Microsoft Purview...");
    try {
      const res = await fetch(`/api/migration/jobs/${activeJobForPurview.id}/import`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purviewJobId: purviewJobIdInput.trim(),
          status: "IMPORTING",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("ID Registado com Sucesso!", "Trabalho em processamento ativo pela Microsoft.");
        setActiveJobForPurview(null);
        setPurviewJobIdInput("");
        fetchData();
      } else {
        dialog.error("Erro ao Registar ID", data.error || "Falha na atualização.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
          <ArrowRightLeft className="w-6 h-6 text-[#e95c0c]" />
          Hub de Migração Google Group → Microsoft 365
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Validação técnica, geração de pacotes PST oficiais para o Microsoft Purview Import Service e acompanhamento auditável.
        </p>
      </div>

      {/* Migration Wizard Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        <h2 className="text-base font-black text-[#223546] uppercase tracking-wider">
          Configurar Nova Preparação de Migração
        </h2>

        {message && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold text-[#e95c0c]">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          {/* Source Group */}
          <div className="space-y-2">
            <label className="font-bold text-slate-700">1. Selecionar Google Group de Origem:</label>
            <select
              value={selectedGroupEmail}
              onChange={(e) => {
                setSelectedGroupEmail(e.target.value);
                setReadiness(null);
              }}
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:border-[#e95c0c]"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.email}>
                  {g.name} ({g.email}) — {g.directMembersCount} membros
                </option>
              ))}
            </select>
          </div>

          {/* Destination Mailbox */}
          <div className="space-y-2">
            <label className="font-bold text-slate-700">2. Selecionar Caixa Microsoft de Destino:</label>
            <select
              value={selectedMailboxEmail}
              onChange={(e) => {
                setSelectedMailboxEmail(e.target.value);
                setReadiness(null);
              }}
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:border-[#e95c0c]"
            >
              {mailboxes.map((mb) => (
                <option key={mb.id} value={mb.primarySmtpAddress}>
                  {mb.primarySmtpAddress} ({mb.recipientType === "SHARED_MAILBOX" ? "★ SHARED MAILBOX" : mb.recipientType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handleValidate}
            disabled={loadingReadiness}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{loadingReadiness ? "A Validar..." : "Validar Prontidão (Readiness)"}</span>
          </button>

          <button
            onClick={handlePrepare}
            disabled={actionLoading || (readiness && !readiness.isReady)}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white transition flex items-center gap-2 ${
              readiness && !readiness.isReady
                ? "bg-slate-300 cursor-not-allowed"
                : "bg-[#e95c0c] hover:bg-[#d04f08] cursor-pointer"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Preparar Migração & Gerar CSV Purview</span>
          </button>
        </div>

        {/* Readiness Checklist Card */}
        {readiness && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-[#223546] uppercase tracking-wider">
                Relatório de Prontidão da Migração (Migration Readiness)
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  readiness.isReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {readiness.isReady ? "APROVADO PARA MIGRAÇÃO" : "REQUISITOS PENDENTES"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {readiness.checks.map((c: any) => (
                <div key={c.key} className="flex items-start gap-2.5">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${c.isMandatory ? "text-rose-500" : "text-amber-500"}`}
                    />
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

      {/* Migration Jobs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-base font-black text-[#223546] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#e95c0c]" />
            Trabalhos de Migração Registados
          </h2>
          <button
            onClick={fetchData}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Grupo Origem</th>
                <th className="py-3 px-4">Destino Microsoft</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Mapeamento Purview</th>
                <th className="py-3 px-4 text-center">AzCopy Upload</th>
                <th className="py-3 px-4">Purview Job ID</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loadingJobs ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    A carregar trabalhos de migração...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhum trabalho de migração iniciado. Configure um grupo acima.
                  </td>
                </tr>
              ) : (
                jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{j.sourceGroupEmail}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{j.targetMailboxEmail}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          j.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800"
                            : j.status === "AWAITING_PURVIEW_JOB"
                            ? "bg-amber-100 text-amber-800"
                            : j.status === "READY_TO_IMPORT"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {j.purviewMappingCsvPath ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Gerado
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-slate-600 font-bold">{j.azcopyStatus || "Pendente"}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {j.purviewJobId || <span className="text-slate-400">Não informado</span>}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      {j.status === "READY_TO_IMPORT" && (
                        <button
                          onClick={() => handleTriggerImport(j.id)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold transition cursor-pointer"
                        >
                          Avançar Purview
                        </button>
                      )}
                      {j.status === "AWAITING_PURVIEW_JOB" && (
                        <button
                          onClick={() => {
                            setActiveJobForPurview(j);
                            setPurviewJobIdInput(j.purviewJobId || "");
                          }}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition cursor-pointer"
                        >
                          Registar Job ID
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: REGISTAR PURVIEW JOB ID                                      */}
      {/* ------------------------------------------------------------------- */}
      {activeJobForPurview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-black text-sm text-[#223546] uppercase tracking-wider">
              Registar Microsoft Purview Import Job ID
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Após criar o Import Job no portal Microsoft Purview com o ficheiro de mapeamento CSV gerado, insira o ID atribuído para rastreabilidade:
            </p>

            <input
              type="text"
              placeholder="Ex: Purview-Import-Informatica-20261002"
              value={purviewJobIdInput}
              onChange={(e) => setPurviewJobIdInput(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#e95c0c]"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActiveJobForPurview(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePurviewJobId}
                className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white font-bold rounded-lg text-xs"
              >
                Guardar ID
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
