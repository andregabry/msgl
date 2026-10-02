"use client";

import React, { useEffect, useState } from "react";
import {
  Settings,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  ShieldCheck,
  Database,
  Cloud,
  X,
  Save,
  HelpCircle,
} from "lucide-react";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export default function IntegrationsPage() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; message: string; success: boolean } | null>(null);

  // Google Configuration Modal State
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleKeyPath, setGoogleKeyPath] = useState("");
  const [googleAdmin, setGoogleAdmin] = useState("");
  const [googleProjectId, setGoogleProjectId] = useState("");
  const [googleCustomerId, setGoogleCustomerId] = useState("");
  const [googleDomain, setGoogleDomain] = useState("");
  const [googleMatterId, setGoogleMatterId] = useState("");
  const [savingGoogle, setSavingGoogle] = useState(false);

  // Microsoft Configuration Modal State
  const [isMicrosoftModalOpen, setIsMicrosoftModalOpen] = useState(false);
  const [msTenantId, setMsTenantId] = useState("");
  const [msClientId, setMsClientId] = useState("");
  const [msClientSecret, setMsClientSecret] = useState("");
  const [msTargetDomain, setMsTargetDomain] = useState("");
  const [msPurviewSasUrl, setMsPurviewSasUrl] = useState("");
  const [savingMicrosoft, setSavingMicrosoft] = useState(false);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrations");
      if (res.ok) {
        const d = await res.json();
        setData(d);
        // Pre-fill form fields
        if (d.google) {
          setGoogleKeyPath(d.google.serviceAccountKeyPath || "");
          setGoogleAdmin(d.google.adminImpersonated || "");
          setGoogleProjectId(d.google.projectId || "");
          setGoogleCustomerId(d.google.customerId || "my_customer");
          setGoogleDomain(d.google.allowedDomain || "");
          setGoogleMatterId(d.google.matterId || "");
        }
        if (d.microsoft) {
          setMsTenantId(d.microsoft.tenantId || "");
          setMsClientId(d.microsoft.clientId || "");
          setMsTargetDomain(d.microsoft.targetDomain || "");
          setMsPurviewSasUrl(d.microsoft.purviewPstSasUrl || "");
        }
      } else {
        const err = await res.json();
        console.error("Erro ao carregar integrações:", err);
      }
    } catch (err) {
      console.error("Falha ao carregar integrações:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleTestConnection = async (provider: "GOOGLE" | "MICROSOFT") => {
    const isConfigured = provider === "GOOGLE" ? data?.google?.isConfigured : data?.microsoft?.isConfigured;
    const providerLabel = provider === "GOOGLE" ? "Google Workspace & Vault" : "Microsoft 365 (Entra ID & Graph)";

    // If not configured, guide the administrator directly to the configuration modal
    if (!isConfigured) {
      const openModal = await confirmAction({
        title: `${providerLabel} Não Configurado`,
        text: `As credenciais de acesso ainda não foram preenchidas no sistema. Deseja abrir a janela de configuração agora?`,
        confirmText: "Abrir Configuração",
        cancelText: "Mais Tarde",
        icon: "warning",
      });

      if (openModal) {
        if (provider === "GOOGLE") setIsGoogleModalOpen(true);
        else setIsMicrosoftModalOpen(true);
      }
      return;
    }

    setTestingProvider(provider);
    setTestResult(null);
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
        fetchIntegrations();
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

  const handleSaveGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoogle(true);
    showLoading("A Guardar Configurações Google...", "A persistir parâmetros no sistema...");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "GOOGLE",
          config: {
            serviceAccountKeyPath: googleKeyPath,
            adminImpersonated: googleAdmin,
            projectId: googleProjectId,
            customerId: googleCustomerId,
            allowedDomain: googleDomain,
            matterId: googleMatterId,
          },
        }),
      });
      const resData = await res.json();
      hideLoading();

      if (res.ok && resData.success) {
        setIsGoogleModalOpen(false);
        toast.success("Configuração Google Guardada!", "Parâmetros de Service Account e Vault atualizados.");
        fetchIntegrations();
      } else {
        dialog.error("Erro ao Guardar", resData.error || resData.message || "Falha ao gravar configurações.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setSavingGoogle(false);
    }
  };

  const handleSaveMicrosoft = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMicrosoft(true);
    showLoading("A Guardar Configurações Microsoft...", "A persistir parâmetros no sistema...");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "MICROSOFT",
          config: {
            tenantId: msTenantId,
            clientId: msClientId,
            clientSecret: msClientSecret,
            targetDomain: msTargetDomain,
            purviewPstSasUrl: msPurviewSasUrl,
          },
        }),
      });
      const resData = await res.json();
      hideLoading();

      if (res.ok && resData.success) {
        setIsMicrosoftModalOpen(false);
        setMsClientSecret(""); // Clear cleartext secret
        toast.success("Configuração Microsoft Guardada!", "Credenciais Microsoft Graph e Purview atualizadas.");
        fetchIntegrations();
      } else {
        dialog.error("Erro ao Guardar", resData.error || resData.message || "Falha ao gravar configurações.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setSavingMicrosoft(false);
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
        {/* ================================================================= */}
        {/* GOOGLE WORKSPACE CARD                                             */}
        {/* ================================================================= */}
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
                <span className="font-bold text-slate-400">Ficheiro Service Account (Key Path):</span>
                <div className="font-mono text-slate-800 truncate" title={data?.google?.serviceAccountKeyPath}>
                  {data?.google?.serviceAccountKeyPath || "Não configurado"}
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Conta de Administração a Impersonar:</span>
                <div className="font-mono text-slate-800">{data?.google?.adminImpersonated || "Não configurado"}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Projeto Google Cloud:</span>
                <div className="font-mono text-slate-800">{data?.google?.projectId || "Não configurado"}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Matter Dedicado (Vault):</span>
                <div className="font-mono text-slate-800">{data?.google?.matterId || "(Automático: MigrateSystem_Backup_Archive)"}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Domínio Autorizado:</span>
                <div className="font-mono text-slate-800">{data?.google?.allowedDomain || "Não configurado"}</div>
              </div>
              {data?.google?.lastTestedAt && (
                <div>
                  <span className="font-bold text-slate-400">Último Teste com Sucesso:</span>
                  <div className="text-slate-600 font-medium">
                    {new Date(data.google.lastTestedAt).toLocaleString("pt-PT")}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
            <button
              onClick={() => setIsGoogleModalOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5 text-[#e95c0c]" />
              <span>Configurar Parâmetros</span>
            </button>

            <button
              onClick={() => handleTestConnection("GOOGLE")}
              disabled={testingProvider === "GOOGLE"}
              className="px-4 py-2 bg-[#e95c0c] hover:bg-[#c84c06] text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === "GOOGLE" ? "animate-spin" : ""}`} />
              <span>{testingProvider === "GOOGLE" ? "A Testar Conexão..." : "Testar Ligação Google Vault"}</span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* MICROSOFT 365 CARD                                                */}
        {/* ================================================================= */}
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
                <div className="font-mono text-slate-800">{data?.microsoft?.tenantId || "Não configurado"}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Application (Client) ID:</span>
                <div className="font-mono text-slate-800">{data?.microsoft?.clientId || "Não configurado"}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Client Secret:</span>
                <div className="font-mono text-slate-800">
                  {data?.microsoft?.clientSecretConfigured ? "●●●●●●●●●● (Configurado)" : "Não configurado"}
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Domínio de Destino:</span>
                <div className="font-mono text-slate-800">{data?.microsoft?.targetDomain || "Não configurado"}</div>
              </div>
              <div>
                <span className="font-bold text-slate-400">Purview PST SAS URL:</span>
                <div className="font-mono text-slate-800">
                  {data?.microsoft?.purviewUploadConfigured ? "Configurada (Protegida)" : "Não configurada"}
                </div>
              </div>
              {data?.microsoft?.lastTestedAt && (
                <div>
                  <span className="font-bold text-slate-400">Último Teste com Sucesso:</span>
                  <div className="text-slate-600 font-medium">
                    {new Date(data.microsoft.lastTestedAt).toLocaleString("pt-PT")}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap justify-end gap-2">
            <button
              onClick={() => setIsMicrosoftModalOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5 text-sky-600" />
              <span>Configurar Parâmetros</span>
            </button>

            <button
              onClick={() => handleTestConnection("MICROSOFT")}
              disabled={testingProvider === "MICROSOFT"}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingProvider === "MICROSOFT" ? "animate-spin" : ""}`} />
              <span>{testingProvider === "MICROSOFT" ? "A Testar Conexão..." : "Testar Ligação Microsoft Graph"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL: CONFIGURAÇÃO GOOGLE WORKSPACE                                */}
      {/* =================================================================== */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-[#1c2836] border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-5 text-white animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-[#e95c0c] flex items-center justify-center font-bold">
                  G
                </div>
                <div>
                  <h3 className="text-base font-black">Configuração Google Workspace & Vault</h3>
                  <p className="text-xs text-slate-400">Credenciais oficiais da Google Cloud e delegação de domínio</p>
                </div>
              </div>
              <button
                onClick={() => setIsGoogleModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-700/60 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGoogle} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">Caminho da Service Account JSON (Chave Privada):</label>
                <input
                  type="text"
                  required
                  placeholder="C:/Users/.../service-account.json"
                  value={googleKeyPath}
                  onChange={(e) => setGoogleKeyPath(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#e95c0c]"
                />
                <p className="text-[11px] text-slate-400">
                  Caminho absoluto para o ficheiro JSON da Service Account gerada na Google Cloud Console com Domain-Wide Delegation.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">E-mail de Super Administrador (Impersonação):</label>
                <input
                  type="email"
                  required
                  placeholder="admin@dominio.pt"
                  value={googleAdmin}
                  onChange={(e) => setGoogleAdmin(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#e95c0c]"
                />
                <p className="text-[11px] text-slate-400">
                  Conta com privilégios de Super Admin no Google Workspace para aceder a Directory API e Vault.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200">Google Cloud Project ID:</label>
                  <input
                    type="text"
                    required
                    placeholder="enging-migration"
                    value={googleProjectId}
                    onChange={(e) => setGoogleProjectId(e.target.value)}
                    className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#e95c0c]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200">Customer ID:</label>
                  <input
                    type="text"
                    required
                    placeholder="my_customer"
                    value={googleCustomerId}
                    onChange={(e) => setGoogleCustomerId(e.target.value)}
                    className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#e95c0c]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200">Domínio Autorizado:</label>
                  <input
                    type="text"
                    required
                    placeholder="enging.pt"
                    value={googleDomain}
                    onChange={(e) => setGoogleDomain(e.target.value)}
                    className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#e95c0c]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-200">Matter ID Dedicado (Opcional):</label>
                  <input
                    type="text"
                    placeholder="Deixe vazio para automático"
                    value={googleMatterId}
                    onChange={(e) => setGoogleMatterId(e.target.value)}
                    className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#e95c0c]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setIsGoogleModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingGoogle}
                  className="px-4 py-2 bg-[#e95c0c] hover:bg-[#c84c06] text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingGoogle ? "A Guardar..." : "Guardar Parâmetros Google"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: CONFIGURAÇÃO MICROSOFT 365                                  */}
      {/* =================================================================== */}
      {isMicrosoftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-[#1c2836] border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-5 text-white animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-700/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                  M
                </div>
                <div>
                  <h3 className="text-base font-black">Configuração Microsoft 365 & Purview</h3>
                  <p className="text-xs text-slate-400">Credenciais Entra ID App Registration e SAS URL do Purview</p>
                </div>
              </div>
              <button
                onClick={() => setIsMicrosoftModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-700/60 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMicrosoft} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">Directory (Tenant) ID:</label>
                <input
                  type="text"
                  required
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={msTenantId}
                  onChange={(e) => setMsTenantId(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400">
                  ID do locatário Azure Entra ID / Microsoft 365.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">Application (Client) ID:</label>
                <input
                  type="text"
                  required
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={msClientId}
                  onChange={(e) => setMsClientId(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400">
                  ID da App Registration criada no Microsoft Entra ID.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">
                  Client Secret (Valor do Segredo):
                  {data?.microsoft?.clientSecretConfigured && (
                    <span className="text-emerald-400 font-normal pl-2">(Já configurado. Deixe vazio para manter)</span>
                  )}
                </label>
                <input
                  type="password"
                  placeholder={data?.microsoft?.clientSecretConfigured ? "•••••••••••• (Inalterado)" : "Cole aqui o segredo gerado no Entra ID"}
                  value={msClientSecret}
                  onChange={(e) => setMsClientSecret(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400">
                  Valor do segredo gerado em "Certificates & secrets" no portal do Azure.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">Domínio Principal Microsoft 365:</label>
                <input
                  type="text"
                  required
                  placeholder="dynamox.net ou enging.pt"
                  value={msTargetDomain}
                  onChange={(e) => setMsTargetDomain(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-200">Microsoft Purview PST SAS URL (Azure Blob Storage):</label>
                <input
                  type="text"
                  placeholder="https://ingestionprodeu1.blob.core.windows.net/ingestiondir...?sv=2015-04-05&sr=c..."
                  value={msPurviewSasUrl}
                  onChange={(e) => setMsPurviewSasUrl(e.target.value)}
                  className="w-full bg-[#121921] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400">
                  SAS URL temporária fornecida pelo Microsoft Purview Compliance Portal para upload de ficheiros PST com AzCopy.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setIsMicrosoftModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMicrosoft}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingMicrosoft ? "A Guardar..." : "Guardar Parâmetros Microsoft"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
