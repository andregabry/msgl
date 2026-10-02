"use client";

import React, { useEffect, useState } from "react";
import { Cloud, Search, RefreshCw, Mail, Users, CheckCircle2, ArrowRightLeft } from "lucide-react";
import Link from "next/link";

export default function MicrosoftMailboxesPage() {
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [counts, setCounts] = useState<any>({ USER_MAILBOX: 0, SHARED_MAILBOX: 0 });

  const fetchMailboxes = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/microsoft/mailboxes?page=${page}&limit=20&type=${typeFilter}&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const data = await res.json();
        setMailboxes(data.mailboxes || []);
        setTotal(data.total || 0);
        setCounts(data.counts || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMailboxes();
  }, [page, typeFilter, search]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/microsoft/mailboxes", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`Sincronização de caixas Microsoft concluída! Total: ${data.totalSynced}`);
        fetchMailboxes();
      } else {
        alert(`Erro: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Falha: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
            <Mail className="w-6 h-6 text-sky-600" />
            Caixas de Correio Microsoft 365 (User & Shared Mailboxes)
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Inventário de caixas de correio do Exchange Online identificadas e classificadas para destino de migração.
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? "A Sincronizar Mailboxes..." : "Sincronizar Mailboxes"}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-4 justify-between items-center text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por endereço ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex border border-slate-200 rounded-lg overflow-hidden font-bold">
            <button
              onClick={() => setTypeFilter("ALL")}
              className={`px-3 py-1.5 transition ${
                typeFilter === "ALL" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todas ({total})
            </button>
            <button
              onClick={() => setTypeFilter("SHARED_MAILBOX")}
              className={`px-3 py-1.5 transition ${
                typeFilter === "SHARED_MAILBOX" ? "bg-sky-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Shared Mailboxes ({counts.SHARED_MAILBOX || 0})
            </button>
            <button
              onClick={() => setTypeFilter("USER_MAILBOX")}
              className={`px-3 py-1.5 transition ${
                typeFilter === "USER_MAILBOX" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              User Mailboxes ({counts.USER_MAILBOX || 0})
            </button>
          </div>
        </div>

        <div className="text-slate-500 font-semibold">
          Tenant: <span className="font-bold text-[#223546]">dynamox.net</span>
        </div>
      </div>

      {/* Mailboxes Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Nome de Exibição</th>
                <th className="py-3 px-4">Endereço SMTP Principal</th>
                <th className="py-3 px-4 text-center">Tipo de Caixa</th>
                <th className="py-3 px-4">Google Group Associado</th>
                <th className="py-3 px-4">Última Sincronização</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    A carregar caixas Microsoft...
                  </td>
                </tr>
              ) : mailboxes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhuma caixa encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                mailboxes.map((mb) => {
                  const isShared = mb.recipientType === "SHARED_MAILBOX";
                  const mapping = mb.migrationMappings?.[0];

                  return (
                    <tr key={mb.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 font-bold text-slate-900">{mb.displayName}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700">{mb.primarySmtpAddress}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isShared
                              ? "bg-sky-50 text-sky-700 border border-sky-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isShared ? "★ SHARED MAILBOX" : mb.recipientType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {mapping ? mapping.sourceGroupEmail : <span className="text-slate-400">Nenhum</span>}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {mb.lastSyncedAt ? new Date(mb.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/migration?targetMailbox=${encodeURIComponent(mb.primarySmtpAddress)}`}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition"
                        >
                          <ArrowRightLeft className="w-3 h-3 text-[#e95c0c]" />
                          <span>Migrar</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
