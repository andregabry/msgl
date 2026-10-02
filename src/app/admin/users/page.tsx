"use client";

import React, { useEffect, useState } from "react";
import { Users, Shield, UserCheck, RefreshCw, CheckCircle2 } from "lucide-react";

export default function PlatformUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#e95c0c]" />
          Utilizadores Internos & Perfis RBAC
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Controlo de acessos à plataforma, mapeamento de identidades externas (Google OIDC) e atribuição de funções operacionais.
        </p>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Nome de Exibição</th>
                <th className="py-3 px-4">E-mail Principal</th>
                <th className="py-3 px-4 text-center">Função (Role)</th>
                <th className="py-3 px-4 text-center">Identidades Conectadas</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4">Data de Criação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    A carregar utilizadores da plataforma...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Nenhum utilizador interno registado.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{u.displayName}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{u.email}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          u.role === "ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : u.role === "BACKUP_OPERATOR"
                            ? "bg-blue-100 text-blue-800"
                            : u.role === "MIGRATION_OPERATOR"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-1">
                        {u.externalIdentities && u.externalIdentities.length > 0 ? (
                          u.externalIdentities.map((ei: any) => (
                            <span key={ei.id} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {ei.provider}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">Interna</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {new Date(u.createdAt).toLocaleString("pt-PT")}
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
