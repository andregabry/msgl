"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert, Search, RefreshCw, Clock, Filter, Eye } from "lucide-react";

export default function AuditTrailPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/audit?page=${page}&limit=50&action=${actionFilter}&entityType=${entityFilter}`
      );
      if (res.ok) {
        const d = await res.json();
        setEvents(d.events || []);
        setTotal(d.total || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [page, actionFilter, entityFilter]);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-[#e95c0c]" />
          Trilha de Auditoria Imutável (Audit Trail)
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Registo criptográfico de todas as operações sensíveis, transferências de dados, consultas administrativas e migrações.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-4 justify-between items-center text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg bg-white font-medium"
          >
            <option value="ALL">Todas as Ações</option>
            <option value="LOGIN">LOGIN</option>
            <option value="GOOGLE_SYNC">GOOGLE_SYNC</option>
            <option value="MICROSOFT_SYNC">MICROSOFT_SYNC</option>
            <option value="BACKUP_REQUESTED">BACKUP_REQUESTED</option>
            <option value="BACKUP_DOWNLOADED">BACKUP_DOWNLOADED</option>
            <option value="BACKUP_FILE_DOWNLOADED">BACKUP_FILE_DOWNLOADED</option>
            <option value="CHAT_VIEW_ADMIN">CHAT_VIEW_ADMIN</option>
            <option value="MIGRATION_CREATED">MIGRATION_CREATED</option>
            <option value="MIGRATION_STARTED">MIGRATION_STARTED</option>
          </select>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="p-2 border border-slate-200 rounded-lg bg-white font-medium"
          >
            <option value="ALL">Todas as Entidades</option>
            <option value="USER">USER</option>
            <option value="GROUP">GROUP</option>
            <option value="BACKUP">BACKUP</option>
            <option value="CHAT">CHAT</option>
            <option value="MIGRATION">MIGRATION</option>
            <option value="INTEGRATION">INTEGRATION</option>
          </select>
        </div>

        <div className="text-slate-500 font-semibold">
          Total registado: <span className="font-bold text-[#223546]">{total}</span> eventos
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4">Utilizador Responsável</th>
                <th className="py-3 px-4 text-center">Ação</th>
                <th className="py-3 px-4 text-center">Tipo de Entidade</th>
                <th className="py-3 px-4">ID da Entidade / Detalhes</th>
                <th className="py-3 px-4">IP / Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    A carregar eventos de auditoria...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhum evento registado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {new Date(e.createdAt).toISOString()}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {e.actorUser?.email || "Sistema / Background"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {e.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                        {e.entityType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 truncate max-w-xs">
                      {e.entityId || JSON.stringify(e.metadata || {})}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {e.ipAddress || "127.0.0.1"}
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
