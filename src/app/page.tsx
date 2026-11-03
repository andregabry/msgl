"use client";

import React, { useEffect, useState } from "react";
import {
  Users,
  Database,
  MessageSquare,
  Cloud,
  ArrowRightLeft,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface DashboardStats {
  google: {
    totalUsers: number;
    activeUsers: number;
    suspendedUsers: number;
    totalGroups: number;
    lastSync?: string;
  };
  backups: {
    total: number;
    requested: number;
    running: number;
    remoteReady: number;
    downloading: number;
    ready: number;
    failed: number;
    storageBytes: string;
  };
  chat: {
    archivesProcessed: number;
    indexedMessages: number;
    spaces: number;
    attachments: number;
    usersWithHistory: number;
  };
  microsoft: {
    totalUsers: number;
    userMailboxes: number;
    sharedMailboxes: number;
    lastSync?: string;
  };
  migrations: {
    prepared: number;
    pendingPurview: number;
    running: number;
    completed: number;
    failed: number;
  };
  recentJobs: any[];
  recentErrors: any[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatBytes = (bytesStr?: string) => {
    const b = parseInt(bytesStr || "0", 10);
    if (b === 0) return "0 MB";
    const gb = b / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = b / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546]">
            Visão Geral & Hub Operacional
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Monitorização central de inventário Google Workspace, backups Vault, arquivos de Chat e migrações M365.
          </p>
        </div>

        <button
          onClick={fetchStats}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-sm font-semibold shadow-xs transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-[#e95c0c] ${loading ? "animate-spin" : ""}`} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* 5 KPI Domains */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
        {/* Card 1: Google Workspace */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Google Workspace</span>
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#e95c0c] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#223546]">
              {stats?.google.totalUsers ?? 0}
              <span className="text-xs font-semibold text-slate-400 pl-1.5 font-normal">utilizadores</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Ativos:</span>
                <span className="font-bold text-emerald-600">{stats?.google.activeUsers ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Suspensos:</span>
                <span className="font-semibold text-slate-500">{stats?.google.suspendedUsers ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Grupos de Trabalho:</span>
                <span className="font-bold text-[#223546]">{stats?.google.totalGroups ?? 0}</span>
              </div>
            </div>
          </div>
          <Link
            href="/google/accounts"
            className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#e95c0c] hover:underline"
          >
            <span>Ver Inventário Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Card 2: Backups Vault & Storage */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Backups Vault</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#223546]">
              {stats?.backups.total ?? 0}
              <span className="text-xs font-semibold text-slate-400 pl-1.5 font-normal">backups</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Prontos localmente:</span>
                <span className="font-bold text-emerald-600">{stats?.backups.ready ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Em Execução / Fila:</span>
                <span className="font-bold text-amber-600">{stats?.backups.running ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Espaço Utilizado:</span>
                <span className="font-bold text-[#223546]">{formatBytes(stats?.backups.storageBytes)}</span>
              </div>
            </div>
          </div>
          <Link
            href="/backups"
            className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600 hover:underline"
          >
            <span>Gerir Backups</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Card 3: Google Chat Archive */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Google Chat</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#223546]">
              {stats?.chat.indexedMessages ?? 0}
              <span className="text-xs font-semibold text-slate-400 pl-1.5 font-normal">mensagens</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Arquivos Processados:</span>
                <span className="font-bold text-slate-700">{stats?.chat.archivesProcessed ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Conversas / Spaces:</span>
                <span className="font-bold text-slate-700">{stats?.chat.spaces ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Anexos Preservados:</span>
                <span className="font-bold text-[#223546]">{stats?.chat.attachments ?? 0}</span>
              </div>
            </div>
          </div>
          <a
            href="https://googlechat.enging.pt"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600 hover:underline"
          >
            <span>Aceder ao Portal Google Chat</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Card 4: Microsoft 365 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Microsoft 365</span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Cloud className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#223546]">
              {stats?.microsoft.totalUsers ?? 0}
              <span className="text-xs font-semibold text-slate-400 pl-1.5 font-normal">contas</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>User Mailboxes:</span>
                <span className="font-bold text-slate-700">{stats?.microsoft.userMailboxes ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Shared Mailboxes:</span>
                <span className="font-bold text-sky-700">{stats?.microsoft.sharedMailboxes ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Tenant Destino:</span>
                <span className="font-semibold text-slate-500">dynamox.net</span>
              </div>
            </div>
          </div>
          <Link
            href="/microsoft/mailboxes"
            className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-sky-600 hover:underline"
          >
            <span>Ver Caixas M365</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Card 5: Migrations */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Migrações</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-[#223546]">
              {(stats?.migrations.prepared ?? 0) + (stats?.migrations.completed ?? 0) + (stats?.migrations.pendingPurview ?? 0)}
              <span className="text-xs font-semibold text-slate-400 pl-1.5 font-normal">trabalhos</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Concluídas:</span>
                <span className="font-bold text-emerald-600">{stats?.migrations.completed ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Aguardando Purview:</span>
                <span className="font-bold text-amber-600">{stats?.migrations.pendingPurview ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Falhas:</span>
                <span className="font-bold text-rose-600">{stats?.migrations.failed ?? 0}</span>
              </div>
            </div>
          </div>
          <Link
            href="/migration"
            className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-purple-600 hover:underline"
          >
            <span>Abrir Migração</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Recent Activity & Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-[#223546] uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#e95c0c]" />
              Últimos Trabalhos em Segundo Plano
            </h2>
            <Link href="/admin/audit" className="text-xs font-bold text-[#e95c0c] hover:underline">
              Ver Histórico Completo
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {stats?.recentJobs && stats.recentJobs.length > 0 ? (
              stats.recentJobs.map((j) => (
                <div key={j.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">{j.jobType}</span>
                    <span className="text-slate-400 pl-2">({j.queueName})</span>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Criado em {new Date(j.createdAt).toLocaleString("pt-PT")}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      j.status === "COMPLETED"
                        ? "bg-emerald-100 text-emerald-800"
                        : j.status === "FAILED"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {j.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                Nenhum trabalho recente registado na fila.
              </div>
            )}
          </div>
        </div>

        {/* Critical Alerts / Audit */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-[#223546] uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Eventos de Auditoria & Erros Notáveis
            </h2>
            <Link href="/admin/audit" className="text-xs font-bold text-[#e95c0c] hover:underline">
              Trilha Completa
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {stats?.recentErrors && stats.recentErrors.length > 0 ? (
              stats.recentErrors.map((e) => (
                <div key={e.id} className="py-3 flex items-start justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">{e.action}</span>
                    <span className="text-slate-400 pl-2">({e.entityType})</span>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {new Date(e.createdAt).toLocaleString("pt-PT")}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                    AUDITADO
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 font-medium flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <span>Nenhum erro crítico ou falha recente registada. Sistema a operar normalmente.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
