"use client";

import React, { useState } from "react";
import {
  Layers,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldAlert,
  MessageSquare,
  ShieldCheck,
  KeyRound,
} from "lucide-react";

interface MsglAuthProps {
  onSuccess: (user: any) => void;
  currentUser?: any;
}

export default function MsglAuth({ onSuccess, currentUser }: MsglAuthProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Force change password states
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isNotGestor, setIsNotGestor] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsNotGestor(false);

    if (!email.trim() || !password) {
      setErrorMsg("Introduza o e-mail e a palavra-passe de gestor.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          targetSystem: "msgl",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error?.includes("Google Chat")) {
          setIsNotGestor(true);
        }
        setErrorMsg(data.error || "Credenciais inválidas para o sistema de gestão.");
        setLoading(false);
        return;
      }

      if (data.mustChangePassword) {
        setTempPassword(password);
        setMustChangePassword(true);
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro de ligação ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg("A nova palavra-passe deve conter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("A confirmação da palavra-passe não coincide.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          currentPassword: tempPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Erro ao atualizar a palavra-passe.");
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-slate-900 text-slate-100 font-sans">
      <div className="w-full max-w-md bg-[#131d27] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-br from-[#1a2634] to-[#0e1620] border-b border-slate-800 p-7 text-center relative overflow-hidden">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-[#e95c0c]/15 border border-[#e95c0c]/30 text-[#e95c0c] items-center justify-center mb-3 shadow-inner">
            <Layers className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">Sistema MSGL</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Painel de Gestão &bull; Migração Google Workspace para Microsoft 365
          </p>
          <div className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-[#e95c0c]/20 border border-[#e95c0c]/40 text-[10px] font-bold tracking-wider uppercase text-orange-400">
            msgl.enging.pt &bull; Acesso Restrito
          </div>
        </div>

        {/* Content Box */}
        <div className="p-6 sm:p-8">
          {/* Notifications */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-950/50 border border-red-800 text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {currentUser && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs space-y-2.5 text-center">
              <ShieldAlert className="w-6 h-6 text-amber-400 mx-auto" />
              <p className="font-bold">Sessão Ativa: {currentUser.displayName || currentUser.email}</p>
              <p className="text-amber-300/80">
                Esta conta não tem permissões de gestão do sistema MSGL.
              </p>
              <div className="flex gap-2 pt-1">
                <a
                  href="https://googlechat.enging.pt"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Google Chat</span>
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/auth/session", { method: "DELETE" });
                    window.location.reload();
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Sair / Mudar Conta
                </button>
              </div>
            </div>
          )}

          {isNotGestor && !currentUser && (
            <div className="mb-5 p-4 rounded-2xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs space-y-2.5 text-center">
              <ShieldAlert className="w-6 h-6 text-amber-400 mx-auto" />
              <p className="font-bold">Acesso Restrito ao Gestor:</p>
              <p className="text-amber-300/80">
                A sua conta não possui privilégios de gestor. O seu acesso está disponível no Portal Google Chat.
              </p>
              <a
                href="https://googlechat.enging.pt"
                className="inline-flex items-center justify-center gap-1.5 w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Ir para o Portal Google Chat</span>
              </a>
            </div>
          )}

          {/* Form */}
          {mustChangePassword ? (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs font-medium">
                Por motivos de segurança, altere a palavra-passe temporária para aceder ao sistema de gestão.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Palavra-Passe Temporária
                </label>
                <input
                  type="text"
                  required
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value.trim())}
                  className="w-full px-3 py-2.5 bg-[#0d141d] border border-slate-700 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Nova Palavra-Passe Definitiva
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d141d] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Confirmar Nova Palavra-Passe
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d141d] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#e95c0c] hover:bg-[#c84c06] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-900/30 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Gravar Senha e Iniciar Sessão</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  E-mail de Gestor / Administrador
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="gestor@dynamox.net ou @enging.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-[#0d141d] border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#e95c0c] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Palavra-Passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-[#0d141d] border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#e95c0c] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#e95c0c] hover:bg-[#c84c06] active:bg-[#a33c04] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-900/30 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Entrar no Gestor MSGL</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {/* Redirection to Google Chat portal for normal users */}
              <div className="pt-4 mt-4 border-t border-slate-800 text-center">
                <p className="text-[11px] text-slate-400 mb-2">
                  É colaborador e procura o arquivo de conversas?
                </p>
                <a
                  href="https://googlechat.enging.pt"
                  className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 bg-[#192533] hover:bg-[#202f42] text-teal-400 text-xs font-bold rounded-xl border border-teal-500/20 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Aceder ao Portal Google Chat</span>
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
