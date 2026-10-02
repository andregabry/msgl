"use client";

import React, { useEffect, useState } from "react";
import { Settings, CheckCircle2, AlertCircle, RefreshCw, Key, ShieldCheck, Database, Cloud } from "lucide-react";
import { toast, dialog, showLoading, hideLoading } from "@/lib/swal";

export default function IntegrationsPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; message: string; success: boolean } | null>(null);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrations");
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleTestConnection = async (provider: "GOOGLE" | "MICROSOFT") => {
    setTestingProvider(provider);
    setTestResult(null);
    const providerLabel = provider === "GOOGLE" ? "Google Workspace & Vault" : "Microsoft Graph";
    showLoading(`A Testar Ligação ${providerLabel}...`, "A autenticar com as credenciais oficiais da cloud...");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const resData = await res.json();
      hideLoading();
      setTestResult({
        provider,
        message: resData.message,
        success: resData.success,
      });

      if (resData.success) {
        dialog.success(`Ligação ${providerLabel} Verificada!`, resData.message);
      } else {
        dialog.error(`Falha na Ligação ${providerLabel}`, resData.message || "Não foi possível validar as credenciais.");
      }
    } catch (err: any) {
      hideLoading();
      setTestResult({
        provider,
        message: `Falha: ${err.message}`,
        success: false,
      });
      dialog.error(`Erro de Comunicação`, err.message || "Erro inesperado ao testar conectividade.");
    } finally {
      setTestingProvider(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#e95c0c]" />
          Integrações Cloud & Parâmetros de Conexão
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Configuração de APIs oficiais para Google Workspace (Admin Directory & Vault) e Microsoft 365 (Graph & Purview).
        </p>
      </div>

      {testResult && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold flex items-center gap-2.5 ${
            testResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {testResult.success ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-rose-500" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Workspace Integration */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-orange-50 text-[#e95c0c] flex items-center justify-center font-bold">
                  G
                </div>
                <div>
                  <h2 className="text-sm font-black text-[#223546]">Google Workspace & Google Vault</h2>
                  <span className="text-[11px] text-slate-400">Directory API + Vault eDiscovery API</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  data?.google?.isConfigured
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {data?.google?.isConfigured ? "CONFIGURADO" : "NÃO CONFIGURADO"}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-400">Projeto Google Cloud:</span>
                <div className="font-mono text-slate-800">{data?.google?.projectId}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Conta de Administração a Impersonar:</span>
                <div className="font-mono text-slate-800">{data?.google?.adminImpersonated}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Matter Dedicado (Vault):</span>
                <div className="font-mono text-slate-800">{data?.google?.matterId}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Domínio Autorizado:</span>
                <div className="font-mono text-slate-800">{data?.google?.allowedDomain}</div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => handleTestConnection("GOOGLE")}
              disabled={testingProvider === "GOOGLE" || !data?.google?.isConfigured}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === "GOOGLE" ? "animate-spin" : ""}`} />
              <span>{testingProvider === "GOOGLE" ? "A Testar Conexão..." : "Testar Ligação Google Vault"}</span>
            </button>
          </div>
        </div>

        {/* Microsoft 365 Integration */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                  M
                </div>
                <div>
                  <h2 className="text-sm font-black text-[#223546]">Microsoft 365 (Entra ID & Purview)</h2>
                  <span className="text-[11px] text-slate-400">Graph API Application-Only + Purview PST Import</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  data?.microsoft?.isConfigured
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {data?.microsoft?.isConfigured ? "CONFIGURADO" : "PENDENTE CREDENCIAIS"}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-400">Microsoft Tenant ID:</span>
                <div className="font-mono text-slate-800">{data?.microsoft?.tenantId}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Application (Client) ID:</span>
                <div className="font-mono text-slate-800">{data?.microsoft?.clientId}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Client Secret:</span>
                <div className="font-mono text-slate-800">
                  {data?.microsoft?.clientSecretConfigured ? "●●●●●●●●●● (Configurado)" : "Não configurado no .env"}
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Purview PST SAS URL:</span>
                <div className="font-mono text-slate-800">
                  {data?.microsoft?.purviewUploadConfigured ? "Configurada (Protegida)" : "Não configurada"}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => handleTestConnection("MICROSOFT")}
              disabled={testingProvider === "MICROSOFT" || !data?.microsoft?.isConfigured}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === "MICROSOFT" ? "animate-spin" : ""}`} />
              <span>{testingProvider === "MICROSOFT" ? "A Testar Conexão..." : "Testar Ligação Microsoft Graph"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
