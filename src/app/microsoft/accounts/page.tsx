"use client";

import React, { useEffect, useState } from "react";
import { Cloud, Search, RefreshCw, CheckCircle2, XCircle, Mail, User } from "lucide-react";

export default function MicrosoftAccountsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/microsoft/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/microsoft/users", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`Sincronização Microsoft Entra concluída! Total: ${data.totalSynced}`);
        fetchUsers();
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
            <Cloud className="w-6 h-6 text-sky-600" />
            Contas de Utilizadores Microsoft 365 (Entra ID)
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Inventário de utilizadores sincronizados via Microsoft Graph API com autenticação Application-Only.
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          <span>{syncing ? "A Sincronizar Graph..." : "Sincronizar Graph"}</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por UPN ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="text-xs text-slate-500 font-semibold">
          Total registado: <span className="font-bold text-[#223546]">{total}</span> utilizadores
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Nome de Exibição</th>
                <th className="py-3 px-4">User Principal Name (UPN)</th>
                <th className="py-3 px-4">E-mail</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Tipo</th>
                <th className="py-3 px-4">Última Sincronização</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    A carregar contas Microsoft...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhuma conta Microsoft sincronizada. Configure as credenciais no menu Sistema &gt; Conexões Cloud.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{u.displayName}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700">{u.userPrincipalName}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{u.mail || "—"}</td>
                    <td className="py-3 px-4 text-center">
                      {u.accountEnabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          <XCircle className="w-3 h-3" /> Desativada
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {u.userType || "Member"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString("pt-PT") : "Pendente"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
