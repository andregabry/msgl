"use client";

import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Mail,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Save,
  Send,
  Eye,
  EyeOff,
  MoreVertical,
  Edit3,
  Trash2,
  Check,
  ShieldCheck,
  Globe,
  Cloud,
  X,
  ExternalLink,
  Sliders,
  AtSign,
} from "lucide-react";
import { AppSwal, toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

export type EmailAccountType = "ACCOUNT" | "SMTP";
export type EmailApiProvider = "GOOGLE_WORKSPACE" | "MICROSOFT_365";

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: "STARTTLS" | "SSL" | "NONE";
  secure: boolean;
  user: string;
  hasPassword?: boolean;
  passwordMasked?: string;
  password?: string;
}

export interface EmailAccountItem {
  id: string;
  type: EmailAccountType;
  name: string;
  apiProvider?: EmailApiProvider;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
  isEnabled: boolean;
  status: "CONNECTED" | "NOT_CONFIGURED" | "ERROR";
  lastTestedAt?: string | null;
  error?: string | null;
  smtp?: SmtpConfig;
  createdAt: string;
  updatedAt: string;
}

export default function MailServerPage() {
  const [accounts, setAccounts] = useState<EmailAccountItem[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Dropdown Action Menu State (Portal floating coordinates)
  const [dropdownState, setDropdownState] = useState<{
    account: EmailAccountItem;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Modal Form State
  const [modalType, setModalType] = useState<EmailAccountType>("ACCOUNT");
  const [accountName, setAccountName] = useState("");
  const [apiProvider, setApiProvider] = useState<EmailApiProvider>("GOOGLE_WORKSPACE");
  const [accountEmailInput, setAccountEmailInput] = useState("");
  const [apiAuthenticated, setApiAuthenticated] = useState(false);
  const [apiAuthLoading, setApiAuthLoading] = useState(false);
  const [apiAuthDetails, setApiAuthDetails] = useState<string | null>(null);

  // SMTP Form State
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpEncryption, setSmtpEncryption] = useState<"STARTTLS" | "SSL" | "NONE">("STARTTLS");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [smtpTestedOk, setSmtpTestedOk] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestError, setSmtpTestError] = useState<string | null>(null);

  // Sender Details (unlocked after authentication / test)
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  // Live Test Modal State
  const [testModalAccount, setTestModalAccount] = useState<EmailAccountItem | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email");
      if (res.ok) {
        const d = await res.json();
        setAccounts(d.accounts || []);
        setDefaultAccountId(d.defaultAccountId || null);
      } else {
        const err = await res.json();
        console.error("Falha ao obter contas de e-mail:", err);
      }
    } catch (err) {
      console.error("Erro na requisição:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  // Close dropdown on outside click or scroll
  useEffect(() => {
    const handleClose = () => setDropdownState(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, []);

  const handleToggleDropdown = (e: React.MouseEvent<HTMLButtonElement>, acc: EmailAccountItem) => {
    e.stopPropagation();
    if (dropdownState?.account.id === acc.id) {
      setDropdownState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 180;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

    setDropdownState({
      account: acc,
      top: openUpwards ? rect.top - 6 : rect.bottom + 6,
      left: rect.right - 210,
      openUpwards,
    });
  };

  const openAddModal = () => {
    setEditingAccountId(null);
    setModalType("ACCOUNT");
    setAccountName("");
    setApiProvider("GOOGLE_WORKSPACE");
    setAccountEmailInput("");
    setApiAuthenticated(false);
    setApiAuthDetails(null);

    setSmtpHost("smtp.gmail.com");
    setSmtpPort(587);
    setSmtpEncryption("STARTTLS");
    setSmtpUser("");
    setSmtpPassword("");
    setShowPassword(false);
    setSmtpTestedOk(false);
    setSmtpTestError(null);

    setFromName("Enging - Sistema de Migração");
    setFromEmail("");
    setIsDefault(accounts.length === 0);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: EmailAccountItem) => {
    setEditingAccountId(acc.id);
    setModalType(acc.type);
    setAccountName(acc.name);
    setFromName(acc.fromName);
    setFromEmail(acc.fromEmail);
    setIsDefault(acc.isDefault);

    if (acc.type === "ACCOUNT") {
      setApiProvider(acc.apiProvider || "GOOGLE_WORKSPACE");
      setAccountEmailInput(acc.fromEmail);
      setApiAuthenticated(true); // Already authenticated previously
      setApiAuthDetails("Conta previamente autenticada e validada.");
    } else {
      setSmtpHost(acc.smtp?.host || "");
      setSmtpPort(acc.smtp?.port || 587);
      setSmtpEncryption(acc.smtp?.encryption || (acc.smtp?.secure ? "SSL" : "STARTTLS"));
      setSmtpUser(acc.smtp?.user || "");
      setSmtpPassword(""); // Password placeholder
      setSmtpTestedOk(true); // Already verified previously
      setSmtpTestError(null);
    }

    setIsModalOpen(true);
  };

  // Listen for OAuth SSO completion from popup window across postMessage, BroadcastChannel, and localStorage
  useEffect(() => {
    const handleAuthData = (data: any) => {
      if (!data || data.type !== "OAUTH_SUCCESS") return;
      const { provider, email, displayName } = data;
      setApiAuthenticated(true);
      setApiAuthLoading(false);
      if (email) {
        setAccountEmailInput(email);
        setFromEmail(email);
      }
      if (displayName) {
        setFromName(displayName);
      } else {
        setFromName((prev) => prev || (provider === "GOOGLE_WORKSPACE" ? "Google Notificações" : "Microsoft Notificações"));
      }
      setApiAuthDetails(
        `Conta ${email} autenticada com sucesso via ${
          provider === "GOOGLE_WORKSPACE" ? "Google Workspace" : "Microsoft 365"
        }!`
      );
      toast.success("Autenticado com Sucesso!", `Conta ${email} validada via SSO.`);
      try {
        localStorage.removeItem("oauth_email_auth_success");
      } catch (e) {}
    };

    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "OAUTH_SUCCESS") {
        handleAuthData(event.data);
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "oauth_email_auth_success" && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          handleAuthData(parsed);
        } catch (e) {}
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("oauth_email_auth");
      bc.onmessage = (event) => {
        handleAuthData(event.data);
      };
    } catch (e) {}

    window.addEventListener("message", handleOAuthMessage);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("message", handleOAuthMessage);
      window.removeEventListener("storage", handleStorageChange);
      if (bc) bc.close();
    };
  }, []);

  // Authenticate API Account via SSO Popup
  const handleAuthenticateApi = () => {
    setApiAuthLoading(true);
    setApiAuthDetails(null);

    const width = 600;
    const height = 740;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popupUrl = `/api/auth/email-oauth/start?provider=${apiProvider}&email=${encodeURIComponent(
      accountEmailInput.trim()
    )}`;

    const popup = window.open(
      popupUrl,
      "oauth_auth_popup",
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      setApiAuthLoading(false);
      dialog.warning(
        "Janela Bloqueada",
        "O seu navegador bloqueou a janela de autenticação. Por favor permita popups para este site ou utilize o link abaixo:",
        {
          footer: `<a href="${popupUrl}" target="_blank" style="color:#e95c0c;font-weight:bold;">Abrir Autenticação em Nova Aba</a>`,
        }
      );
      return;
    }

    const timer = setInterval(() => {
      // Check localStorage for early completion
      try {
        const item = localStorage.getItem("oauth_email_auth_success");
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && parsed.type === "OAUTH_SUCCESS") {
            setApiAuthenticated(true);
            setApiAuthLoading(false);
            if (parsed.email) {
              setAccountEmailInput(parsed.email);
              setFromEmail(parsed.email);
            }
            if (parsed.displayName) setFromName(parsed.displayName);
            setApiAuthDetails(`Conta ${parsed.email} autenticada com sucesso!`);
            localStorage.removeItem("oauth_email_auth_success");
            clearInterval(timer);
            try {
              if (popup && !popup.closed) popup.close();
            } catch (e) {}
            return;
          }
        }
      } catch (e) {}

      if (popup.closed) {
        clearInterval(timer);
        setApiAuthLoading(false);
      }
    }, 800);
  };

  // Test SMTP Connection
  const handleTestSmtpConnection = async () => {
    if (!smtpHost.trim()) {
      dialog.warning("Host Obrigatório", "Por favor indique o servidor SMTP (Host).");
      return;
    }
    if (!smtpUser.trim()) {
      dialog.warning("Conta Obrigatória", "Por favor indique a conta de utilizador para login SMTP.");
      return;
    }

    setSmtpTesting(true);
    setSmtpTestError(null);

    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TEST_SMTP",
          host: smtpHost.trim(),
          port: smtpPort,
          secure: smtpEncryption === "SSL" || smtpPort === 465,
          user: smtpUser.trim(),
          password: smtpPassword.trim(),
          accountId: editingAccountId || undefined,
        }),
      });

      const resData = await res.json();

      if (res.ok && resData.success) {
        setSmtpTestedOk(true);
        setSmtpTestError(null);
        if (!fromEmail) setFromEmail(smtpUser.trim());
        toast.success("Conexão SMTP Bem-Sucedida!", "Aperto de mãos e autenticação de credenciais aceites.");
      } else {
        setSmtpTestedOk(false);
        setSmtpTestError(resData.message || "Erro de ligação.");
        dialog.error("Falha na Conexão SMTP", resData.message || "O servidor recusou a ligação ou as credenciais.");
      }
    } catch (err: any) {
      setSmtpTestedOk(false);
      setSmtpTestError(err.message);
      dialog.error("Erro de Conexão", err.message || "Não foi possível testar a ligação.");
    } finally {
      setSmtpTesting(false);
    }
  };

  // Save Account (Add or Update)
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (modalType === "ACCOUNT" && !apiAuthenticated) {
      dialog.warning("Autenticação Pendente", "Por favor autentique a conta com a API antes de guardar.");
      return;
    }

    if (modalType === "SMTP" && !smtpTestedOk) {
      dialog.warning("Teste Pendente", "Por favor teste a conexão do servidor SMTP com sucesso antes de guardar.");
      return;
    }

    if (!fromName.trim()) {
      dialog.warning("Nome Obrigatório", "Por favor informe o Nome do Remetente (Sender Display Name).");
      return;
    }
    if (!fromEmail.trim() || !fromEmail.includes("@")) {
      dialog.warning("E-mail Obrigatório", "Por favor informe um E-mail de Remetente válido.");
      return;
    }

    setSavingAccount(true);
    showLoading("A guardar conta...", "A registar os parâmetros de remetente no sistema.");

    try {
      const payload: any = {
        action: editingAccountId ? "UPDATE" : "ADD",
        id: editingAccountId || undefined,
        type: modalType,
        name: accountName.trim() || (modalType === "ACCOUNT" ? `Conta ${fromEmail}` : `SMTP ${smtpHost}`),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        isDefault,
      };

      if (modalType === "ACCOUNT") {
        payload.apiProvider = apiProvider;
      } else {
        payload.smtp = {
          host: smtpHost.trim(),
          port: Number(smtpPort),
          encryption: smtpEncryption,
          secure: smtpEncryption === "SSL" || smtpPort === 465,
          user: smtpUser.trim(),
          password: smtpPassword.trim(),
        };
      }

      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      hideLoading();

      if (res.ok && resData.success) {
        setIsModalOpen(false);
        toast.success("Conta Guardada!", resData.message || "Configuração registada com sucesso.");
        fetchAccounts();
      } else {
        dialog.error("Erro ao Guardar", resData.message || "Não foi possível gravar a conta.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setSavingAccount(false);
    }
  };

  // Toggle Account Active / Inactive
  const handleToggleEnabled = async (acc: EmailAccountItem) => {
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TOGGLE_ENABLED",
          id: acc.id,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success(
          resData.isEnabled ? "Conta Ativada" : "Conta Desativada",
          `A conta "${acc.fromName}" agora está ${resData.isEnabled ? "ativa" : "inativa"}.`
        );
        fetchAccounts();
      } else {
        dialog.error("Erro", resData.message || "Falha ao alterar estado da conta.");
      }
    } catch (err: any) {
      dialog.error("Erro", err.message || "Erro inesperado.");
    }
  };

  // Set Default Account
  const handleSetDefault = async (acc: EmailAccountItem) => {
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SET_DEFAULT",
          id: acc.id,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success("Remetente Padrão Atualizado", resData.message);
        fetchAccounts();
      } else {
        dialog.error("Erro", resData.message || "Falha ao definir como padrão.");
      }
    } catch (err: any) {
      dialog.error("Erro", err.message || "Erro inesperado.");
    }
  };

  // Delete Account
  const handleDeleteAccount = async (acc: EmailAccountItem) => {
    const confirmed = await confirmAction({
      title: "Eliminar Conta de E-mail?",
      text: `Tem a certeza que deseja eliminar a conta "${acc.fromName} <${acc.fromEmail}>"? Esta ação não pode ser revertida.`,
      confirmText: "Sim, Eliminar",
      cancelText: "Cancelar",
      icon: "warning",
    });

    if (!confirmed) return;

    showLoading("A eliminar conta...", "A remover da lista de remetentes do sistema.");

    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DELETE",
          id: acc.id,
        }),
      });

      const resData = await res.json();
      hideLoading();

      if (res.ok && resData.success) {
        toast.success("Conta Eliminada", "A conta foi removida com êxito.");
        fetchAccounts();
      } else {
        dialog.error("Erro", resData.message || "Não foi possível eliminar a conta.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Dispatch Live Test Email from Quick Test Modal
  const handleSendLiveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testModalAccount) return;
    if (!testRecipient.trim() || !testRecipient.includes("@")) {
      dialog.warning("Destinatário Inválido", "Por favor introduza um endereço de e-mail de destino válido.");
      return;
    }

    setSendingTest(true);
    showLoading("A expedir e-mail de teste...", `A enviar através de ${testModalAccount.fromName} para ${testRecipient}.`);

    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TEST_SEND",
          accountId: testModalAccount.id,
          testRecipient: testRecipient.trim(),
        }),
      });

      const resData = await res.json();
      hideLoading();

      if (res.ok && resData.success) {
        dialog.success(
          "E-mail de Teste Expedido!",
          `Mensagem entregue com sucesso para "${testRecipient}".\n\nO servidor e o remetente oficial responderam com êxito.`
        );
        setTestModalAccount(null);
        fetchAccounts();
      } else {
        dialog.error("Falha no Envio de Teste", resData.message || "O servidor recusou a transmissão.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Erro", err.message || "Falha ao enviar mensagem de teste.");
    } finally {
      setSendingTest(false);
    }
  };

  const defaultAccount = accounts.find((a) => a.isDefault && a.isEnabled) || accounts.find((a) => a.isEnabled) || accounts[0];

  return (
    <div className="space-y-8 max-w-7xl pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] dark:text-white flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-[#e95c0c]" />
            Servidor de E-mail & Contas de Envio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Gestão de contas e servidores autorizados para emitir as comunicações e notificações de todo o sistema.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAccounts}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1c2836] border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#e95c0c] ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>

          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#e95c0c] hover:bg-[#d04f08] rounded-xl transition shadow-xs"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Remetente Padrão */}
        <div className="bg-white dark:bg-[#16222f] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Remetente Oficial Ativo
            </span>
            <h3 className="text-sm font-semibold text-[#223546] dark:text-white truncate max-w-[200px]" title={defaultAccount?.fromName}>
              {defaultAccount?.fromName || "Nenhum configurado"}
            </h3>
            <span className="text-xs font-mono text-[#e95c0c] block truncate max-w-[200px]" title={defaultAccount?.fromEmail}>
              {defaultAccount?.fromEmail || "Configure uma conta abaixo"}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#e95c0c] flex items-center justify-center font-bold shrink-0">
            <AtSign className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Total de Contas */}
        <div className="bg-white dark:bg-[#16222f] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Contas & Servidores
            </span>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-black text-[#223546] dark:text-white">
                {accounts.length}
              </h3>
              <span className="text-xs text-slate-400 font-medium">
                ({accounts.filter((a) => a.isEnabled).length} ativas)
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {accounts.filter((a) => a.type === "ACCOUNT").length} via API &bull; {accounts.filter((a) => a.type === "SMTP").length} via SMTP
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#184e8e] flex items-center justify-center font-bold shrink-0">
            <Server className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Estado de Conexão */}
        <div className="bg-white dark:bg-[#16222f] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Estado Operacional
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  defaultAccount?.isEnabled
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-500"
                }`}
              />
              <h3 className="text-sm font-semibold text-[#223546] dark:text-white">
                {defaultAccount?.isEnabled ? "Operacional & Pronto" : "Aguardando Ativação"}
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 block mt-1">
              {defaultAccount?.lastTestedAt
                ? `Testado: ${new Date(defaultAccount.lastTestedAt).toLocaleDateString("pt-PT")}`
                : "Sem testes recentes"}
            </span>
          </div>
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 ${
              defaultAccount?.isEnabled
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600"
                : "bg-amber-50 dark:bg-amber-950/40 text-amber-600"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Accounts List Table */}
      <div className="bg-white dark:bg-[#16222f] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#223546] dark:text-white">
              Contas & Servidores de Envio Configurados
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Defina qual remetente será utilizado como padrão e ative ou desative opções rapidamente com o alternador.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#e95c0c]" />
            A carregar contas de correio...
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Mail className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
                Nenhuma conta ou servidor de e-mail adicionado
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Adicione uma Conta de E-mail (Google Workspace / Microsoft 365) ou um Servidor SMTP para que a plataforma possa enviar comunicações oficiais.
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#e95c0c] hover:bg-[#d04f08] rounded-xl transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Adicionar Primeiro Remetente
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#121921]/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-5">Remetente Oficial</th>
                  <th className="py-3.5 px-4">Método / Conexão</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4 text-center">Ativo (Liga/Desliga)</th>
                  <th className="py-3.5 px-5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                {accounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className={`hover:bg-slate-50/60 dark:hover:bg-[#1a2533]/40 transition ${
                      !acc.isEnabled ? "opacity-60 bg-slate-50/30 dark:bg-[#0e151d]/40" : ""
                    }`}
                  >
                    {/* Remetente & Nome */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                            acc.isDefault
                              ? "bg-orange-100 text-[#e95c0c] dark:bg-orange-950/50"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {acc.type === "ACCOUNT" ? <Cloud className="w-4 h-4" /> : <Server className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white text-[13px]">
                              {acc.fromName}
                            </span>
                            {acc.isDefault && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e95c0c]/10 text-[#e95c0c] border border-[#e95c0c]/20">
                                PADRÃO
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-slate-500 dark:text-slate-400 text-xs block">
                            {acc.fromEmail}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Método / Conexão */}
                    <td className="py-4 px-4">
                      {acc.type === "ACCOUNT" ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-[#184e8e] dark:bg-blue-950/50 dark:text-blue-300">
                            <Globe className="w-3 h-3" />
                            {acc.apiProvider === "MICROSOFT_365" ? "Microsoft Graph API" : "Google Workspace API"}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            Delegação &bull; {acc.apiProvider === "MICROSOFT_365" ? "Exchange" : "Gmail"}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <Server className="w-3 h-3 text-[#e95c0c]" />
                            Servidor SMTP
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            {acc.smtp?.host}:{acc.smtp?.port} ({acc.smtp?.encryption || "TLS"})
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="py-4 px-4">
                      <div className="space-y-0.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            acc.status === "CONNECTED"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : acc.status === "ERROR"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {acc.status === "CONNECTED"
                            ? "OPERACIONAL"
                            : acc.status === "ERROR"
                            ? "ERRO"
                            : "PENDENTE"}
                        </span>
                        {acc.lastTestedAt && (
                          <span className="text-[10px] text-slate-400 block">
                            {new Date(acc.lastTestedAt).toLocaleDateString("pt-PT")}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Toggle Switch (Liga / Desliga) */}
                    <td className="py-4 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(acc)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          acc.isEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                        }`}
                        title={acc.isEnabled ? "Clique para desativar esta conta" : "Clique para ativar esta conta"}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            acc.isEnabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>

                    {/* Ações (3 Pontos Verticais) */}
                    <td className="py-4 px-5 text-right relative">
                      <button
                        onClick={(e) => handleToggleDropdown(e, acc)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Ações da conta"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* FLOATING ACTION DROPDOWN PORTAL                                     */}
      {/* =================================================================== */}
      {mounted &&
        dropdownState &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: `${dropdownState.top}px`,
              left: `${dropdownState.left}px`,
              zIndex: 99999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-52 bg-white dark:bg-[#1c2836] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
          >
            {/* Tornar Padrão */}
            {!dropdownState.account.isDefault && (
              <button
                onClick={() => {
                  handleSetDefault(dropdownState.account);
                  setDropdownState(null);
                }}
                className="w-full text-left px-3.5 py-2 text-slate-700 dark:text-slate-200 hover:bg-orange-50 dark:hover:bg-orange-950/40 hover:text-[#e95c0c] flex items-center gap-2.5 transition font-semibold"
              >
                <Check className="w-4 h-4 text-[#e95c0c]" />
                Tornar Conta Padrão
              </button>
            )}

            {/* Testar Conexão / Envio */}
            <button
              onClick={() => {
                setTestModalAccount(dropdownState.account);
                setTestRecipient(dropdownState.account.fromEmail);
                setDropdownState(null);
              }}
              className="w-full text-left px-3.5 py-2 text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-[#184e8e] flex items-center gap-2.5 transition font-medium"
            >
              <Send className="w-4 h-4 text-[#184e8e]" />
              Testar Envio Real
            </button>

            {/* Editar */}
            <button
              onClick={() => {
                openEditModal(dropdownState.account);
                setDropdownState(null);
              }}
              className="w-full text-left px-3.5 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 transition font-medium"
            >
              <Edit3 className="w-4 h-4 text-slate-400" />
              Editar Parâmetros
            </button>

            <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />

            {/* Eliminar */}
            <button
              onClick={() => {
                handleDeleteAccount(dropdownState.account);
                setDropdownState(null);
              }}
              className="w-full text-left px-3.5 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2.5 transition font-semibold"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              Eliminar Conta
            </button>
          </div>,
          document.body
        )}

      {/* =================================================================== */}
      {/* MODAL: ADICIONAR / EDITAR CONTA OU SERVIDOR SMTP                     */}
      {/* =================================================================== */}
      {mounted && isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#16222f] w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-[#121921]/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#e95c0c] flex items-center justify-center font-bold">
                  {modalType === "ACCOUNT" ? <Cloud className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#223546] dark:text-white">
                    {editingAccountId ? "Editar Remetente de E-mail" : "Adicionar Novo Remetente de E-mail"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Selecione o método de saída e configure a autenticação
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveAccount} className="p-6 space-y-6 overflow-y-auto">
              {/* 1. SELEÇÃO DE TIPO (Conta de e-mail vs Servidor SMTP) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Tipo de Configuração <span className="text-[#e95c0c]">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModalType("ACCOUNT");
                      setApiAuthenticated(false);
                    }}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition ${
                      modalType === "ACCOUNT"
                        ? "border-[#e95c0c] bg-orange-50/30 dark:bg-orange-950/20 text-[#223546] dark:text-white shadow-xs"
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <Cloud className={`w-5 h-5 shrink-0 mt-0.5 ${modalType === "ACCOUNT" ? "text-[#e95c0c]" : "text-slate-400"}`} />
                    <div>
                      <span className="font-semibold text-xs block">Conta de e-mail</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Autenticação via API da plataforma (Google / Microsoft)
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModalType("SMTP");
                      setSmtpTestedOk(false);
                    }}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition ${
                      modalType === "SMTP"
                        ? "border-[#e95c0c] bg-orange-50/30 dark:bg-orange-950/20 text-[#223546] dark:text-white shadow-xs"
                        : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    <Server className={`w-5 h-5 shrink-0 mt-0.5 ${modalType === "SMTP" ? "text-[#e95c0c]" : "text-slate-400"}`} />
                    <div>
                      <span className="font-semibold text-xs block">Servidor SMTP</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Host, porta, segurança e senha de envio
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* FLUXO: CONTA DE E-MAIL (API)                                   */}
              {/* ------------------------------------------------------------- */}
              {modalType === "ACCOUNT" && (
                <div className="space-y-4 pt-1">
                  {/* API Selection */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Qual API irá ser usada para autenticar a conta? <span className="text-[#e95c0c]">*</span>
                    </label>
                    <select
                      value={apiProvider}
                      onChange={(e) => {
                        setApiProvider(e.target.value as EmailApiProvider);
                        setApiAuthenticated(false);
                      }}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition font-medium"
                    >
                      <option value="GOOGLE_WORKSPACE">Google Workspace (API Directory & Gmail Delegação)</option>
                      <option value="MICROSOFT_365">Microsoft 365 (Microsoft Graph & Exchange Online)</option>
                    </select>
                  </div>

                  {/* Account Email Input & Authenticate Button */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Conta de E-mail a Autenticar <span className="text-slate-400 font-normal">(Opcional se pretender selecionar no SSO)</span>
                    </label>
                    <input
                      type="email"
                      value={accountEmailInput}
                      onChange={(e) => {
                        setAccountEmailInput(e.target.value);
                        setApiAuthenticated(false);
                      }}
                      placeholder="Ex: notificacoes@enging.pt ou ti@enging.pt"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition font-mono mb-3"
                    />

                    <button
                      type="button"
                      onClick={handleAuthenticateApi}
                      disabled={apiAuthLoading}
                      className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-[#184e8e] hover:bg-[#123e74] transition shadow-xs flex items-center justify-center gap-2"
                    >
                      {apiAuthLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>A aguardar validação na janela do provedor...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>
                            Autenticar com {apiProvider === "MICROSOFT_365" ? "Microsoft 365 (SSO)" : "Google Workspace (SSO)"}
                          </span>
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-400 mt-1.5 text-center">
                      Será aberta a janela oficial de autenticação da {apiProvider === "MICROSOFT_365" ? "Microsoft" : "Google"} para validar a sua conta.
                    </p>

                    {apiAuthenticated && apiAuthDetails && (
                      <div className="mt-3 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 animate-in fade-in duration-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-emerald-900 dark:text-emerald-200">✓ Conta Autenticada com Sucesso via SSO!</strong>
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5 block">{apiAuthDetails}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* FLUXO: SERVIDOR SMTP                                          */}
              {/* ------------------------------------------------------------- */}
              {modalType === "SMTP" && (
                <div className="space-y-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Servidor SMTP (Host) <span className="text-[#e95c0c]">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpHost}
                      onChange={(e) => {
                        setSmtpHost(e.target.value);
                        setSmtpTestedOk(false);
                      }}
                      placeholder="Ex: smtp.gmail.com, mail.enging.pt"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition font-mono"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Porta SMTP <span className="text-[#e95c0c]">*</span>
                      </label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => {
                          setSmtpPort(Number(e.target.value) || 587);
                          setSmtpTestedOk(false);
                        }}
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        Tipo de Criptografia
                      </label>
                      <select
                        value={smtpEncryption}
                        onChange={(e) => {
                          setSmtpEncryption(e.target.value as any);
                          setSmtpTestedOk(false);
                        }}
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition"
                      >
                        <option value="STARTTLS">STARTTLS (Porta 587)</option>
                        <option value="SSL">SSL / TLS Direto (Porta 465)</option>
                        <option value="NONE">Nenhuma (Porta 25)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Conta de Envio / Utilizador (Username) <span className="text-[#e95c0c]">*</span>
                    </label>
                    <input
                      type="text"
                      value={smtpUser}
                      onChange={(e) => {
                        setSmtpUser(e.target.value);
                        setSmtpTestedOk(false);
                      }}
                      placeholder="Ex: notificacoes@enging.pt"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Palavra-Passe / Senha de Aplicação
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={smtpPassword}
                        onChange={(e) => {
                          setSmtpPassword(e.target.value);
                          setSmtpTestedOk(false);
                        }}
                        placeholder={editingAccountId ? "•••••••••••• (deixe vazio para manter)" : "Senha ou App Password de 16 caracteres"}
                        className="w-full text-xs px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Botão Testar Conexão */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleTestSmtpConnection}
                      disabled={smtpTesting || !smtpHost || !smtpUser}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#184e8e] hover:bg-[#123e74] disabled:opacity-50 rounded-xl transition shadow-xs"
                    >
                      {smtpTesting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {smtpTesting ? "A Testar Conexão..." : "Testar Conexão SMTP"}
                    </button>

                    {smtpTestedOk && (
                      <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Conexão ao servidor SMTP validada e autenticada com sucesso!</span>
                      </div>
                    )}

                    {smtpTestError && (
                      <div className="mt-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{smtpTestError}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* CAMPOS REVELADOS APÓS AUTENTICAÇÃO / TESTE OK                */}
              {/* ------------------------------------------------------------- */}
              {(apiAuthenticated || smtpTestedOk) && (
                <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Autenticação confirmada! Defina os parâmetros do remetente abaixo.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nome do Remetente (Sender Display Name) <span className="text-[#e95c0c]">*</span>
                    </label>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Ex: Enging - Sistema de Migração"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Conta / E-mail do Remetente (From Email) <span className="text-[#e95c0c]">*</span>
                    </label>
                    <input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="Ex: notificacoes@enging.pt"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition font-mono"
                      required
                    />
                  </div>

                  {/* Checkbox estilo liga/desliga para Conta Padrão */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-white block">
                        Tornar conta padrão para o envio de e-mails do sistema
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        Esta conta será o remetente oficial prioritário de todas as comunicações da plataforma.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsDefault(!isDefault)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isDefault ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          isDefault ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={savingAccount || (!apiAuthenticated && !smtpTestedOk)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-[#e95c0c] hover:bg-[#d04f08] disabled:opacity-50 rounded-xl transition shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  {savingAccount ? "A Guardar..." : editingAccountId ? "Atualizar Remetente" : "Guardar Remetente"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* =================================================================== */}
      {/* MODAL: TESTAR ENVIO REAL RÁPIDO                                      */}
      {/* =================================================================== */}
      {mounted && testModalAccount && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#16222f] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#184e8e] flex items-center justify-center font-bold">
                  <Send className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-[#223546] dark:text-white">
                  Testar Envio Real de Mensagem
                </h3>
              </div>
              <button
                onClick={() => setTestModalAccount(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendLiveTest} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-[11px] text-slate-400 block mb-0.5">Remetente a Testar:</span>
                <span className="font-semibold text-slate-800 dark:text-white">
                  {testModalAccount.fromName}
                </span>{" "}
                <span className="font-mono text-slate-500">&lt;{testModalAccount.fromEmail}&gt;</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Enviar Mensagem de Teste Para: <span className="text-[#e95c0c]">*</span>
                </label>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="Ex: o-seu-email@enging.pt"
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101720] text-slate-800 dark:text-white focus:bg-white focus:ring-2 focus:ring-[#e95c0c]/20 focus:border-[#e95c0c] transition"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  O sistema enviará uma mensagem formatada de diagnóstico para confirmar a entrega de e-mail.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTestModalAccount(null)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sendingTest || !testRecipient}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-[#184e8e] hover:bg-[#123e74] disabled:opacity-50 rounded-xl transition shadow-xs"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingTest ? "animate-pulse" : ""}`} />
                  {sendingTest ? "A Enviar..." : "Disparar Teste"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
