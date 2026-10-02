"use client";

import React, { useEffect, useState } from "react";
import { Users, Shield, UserCheck, RefreshCw, CheckCircle2, UserPlus, Edit3 } from "lucide-react";
import { AppSwal, toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

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

  const handleCreateUser = async () => {
    const { value: formValues } = await AppSwal.fire({
      title: "Novo Utilizador da Plataforma",
      html: `
        <div class="space-y-4 text-left pt-2">
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1">Nome de Exibição:</label>
            <input id="swal-name" class="w-full bg-[#121921] border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none" placeholder="Ex: Maria Santos">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1">E-mail Principal:</label>
            <input id="swal-email" type="email" class="w-full bg-[#121921] border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none" placeholder="colaborador@dominio.pt">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-400 mb-1">Função / Perfil RBAC:</label>
            <select id="swal-role" class="w-full bg-[#121921] border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-[#e95c0c] focus:outline-none">
              <option value="USER">USER (Acesso ao Portal 'Meus Chats')</option>
              <option value="BACKUP_OPERATOR">BACKUP_OPERATOR (Gestão de Backups Vault)</option>
              <option value="MIGRATION_OPERATOR">MIGRATION_OPERATOR (Preparação & Purview)</option>
              <option value="AUDITOR">AUDITOR (Visualização de Auditoria)</option>
              <option value="ADMIN">ADMIN (Acesso Integral)</option>
            </select>
          </div>
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Guardar Utilizador",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const name = (document.getElementById("swal-name") as HTMLInputElement)?.value.trim();
        const email = (document.getElementById("swal-email") as HTMLInputElement)?.value.trim();
        const role = (document.getElementById("swal-role") as HTMLSelectElement)?.value;

        if (!name || !email) {
          AppSwal.showValidationMessage("Por favor preencha o nome e o e-mail.");
          return false;
        }
        return { displayName: name, email, role };
      },
    });

    if (!formValues) return;

    showLoading("A Criar Utilizador...", "A registar novo colaborador na base de dados...");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValues),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Utilizador Criado!", `Acesso concedido a ${formValues.email} com a função ${formValues.role}.`);
        fetchUsers();
      } else {
        dialog.error("Erro ao Criar Utilizador", data.error || "Não foi possível guardar o utilizador.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  const handleEditRole = async (user: any) => {
    const { value: newRole } = await AppSwal.fire({
      title: `Alterar Função de ${user.displayName}`,
      input: "select",
      inputOptions: {
        USER: "USER (Apenas Portal 'Meus Chats')",
        BACKUP_OPERATOR: "BACKUP_OPERATOR (Gestão de Backups Vault)",
        MIGRATION_OPERATOR: "MIGRATION_OPERATOR (Preparação & Purview)",
        AUDITOR: "AUDITOR (Acesso a Registos de Auditoria)",
        ADMIN: "ADMIN (Acesso Integral ao Sistema)",
      },
      inputValue: user.role,
      showCancelButton: true,
      confirmButtonText: "Atualizar Perfil",
      cancelButtonText: "Cancelar",
    });

    if (!newRole || newRole === user.role) return;

    showLoading("A Atualizar Perfil...", `A atribuir a função ${newRole}...`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          displayName: user.displayName,
          role: newRole,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Perfil Atualizado!", `Função de ${user.email} alterada para ${newRole}.`);
        fetchUsers();
      } else {
        dialog.error("Erro ao Atualizar Perfil", data.error || "Falha na atualização.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
            <Shield className="w-6 h-6 text-[#e95c0c]" />
            Utilizadores Internos & Perfis RBAC
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Controlo de acessos à plataforma, mapeamento de identidades externas (Google OIDC) e atribuição de funções operacionais.
          </p>
        </div>

        <button
          onClick={handleCreateUser}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg text-sm font-bold shadow-xs transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Criar Utilizador Interno</span>
        </button>
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
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    A carregar utilizadores da plataforma...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
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
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleEditRole(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition cursor-pointer"
                        title="Alterar Função RBAC"
                      >
                        <Edit3 className="w-3 h-3 text-[#e95c0c]" />
                        <span>Editar</span>
                      </button>
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
