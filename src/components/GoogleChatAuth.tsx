"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";

interface GoogleChatAuthProps {
  onSuccess: (user: any) => void;
}

export default function GoogleChatAuth({ onSuccess }: GoogleChatAuthProps) {
  const [mode, setMode] = useState<"LOGIN" | "FIRST_ACCESS" | "CHANGE_PASSWORD">("LOGIN");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Change password states
  const [tempPassword, setTempPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // UI status
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 1. Submit Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg("Por favor, preencha o e-mail e a palavra-passe.");
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
          targetSystem: "googlechat",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.needsFirstAccess) {
          setErrorMsg(data.error);
          setMode("FIRST_ACCESS");
        } else {
          setErrorMsg(data.error || "Erro ao efetuar autenticação.");
        }
        setLoading(false);
        return;
      }

      // Check if password must be changed (first access with temporary password)
      if (data.mustChangePassword) {
        setTempPassword(password);
        setMode("CHANGE_PASSWORD");
        setSuccessMsg(
          "Primeiro acesso detetado! Por motivos de segurança, defina agora a sua nova palavra-passe definitiva."
        );
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro inesperado de ligação.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit First Access (Request 8-character temporary password)
  const handleFirstAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg("Introduza o seu endereço de e-mail institucional.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/first-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Não foi possível processar o primeiro acesso.");
        setLoading(false);
        return;
      }

      setSuccessMsg(data.message);
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Submit Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!tempPassword) {
      setErrorMsg("Introduza a palavra-passe temporária de 8 caracteres que recebeu por e-mail.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg("A nova palavra-passe deve conter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("A confirmação da palavra-passe não coincide com a nova palavra-passe.");
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
        setErrorMsg(data.error || "Erro ao definir a nova palavra-passe.");
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro inesperado de ligação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-slate-100 dark:bg-[#0d131a] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        {/* Brand Banner */}
        <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white p-7 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
          <div className="inline-flex w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-md items-center justify-center mb-3 shadow-inner border border-white/20">
            <MessageSquare className="w-7 h-7 text-white stroke-[2.5]" />
          </div>
          <h1 className="text-xl font-black tracking-tight">Google Chat Archive</h1>
          <p className="text-xs text-teal-100 font-medium mt-1">
            Portal do Colaborador &bull; Histórico Arquivado de Mensagens
          </p>
          <div className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-teal-900/40 border border-teal-400/30 text-[10px] font-bold tracking-wider uppercase text-teal-200">
            googlechat.enging.pt
          </div>
        </div>

        {/* Content Box */}
        <div className="p-6 sm:p-8">
          {/* Notifications */}
          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 text-teal-800 dark:text-teal-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{successMsg}</div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 1. LOGIN MODE                                                   */}
          {/* =============================================================== */}
          {mode === "LOGIN" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  E-mail Institucional
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="utilizador@enging.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Palavra-Passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Entrar no Google Chat</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              {/* Divider & First Access Trigger */}
              <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  É o seu primeiro acesso ao portal?
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setMode("FIRST_ACCESS");
                  }}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b2633] dark:hover:bg-[#223040] text-teal-700 dark:text-teal-400 text-xs font-bold rounded-xl border border-teal-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Primeiro Acesso: Obter Senha Temporária</span>
                </button>
              </div>
            </form>
          )}

          {/* =============================================================== */}
          {/* 2. FIRST ACCESS MODE                                            */}
          {/* =============================================================== */}
          {mode === "FIRST_ACCESS" && (
            <div className="space-y-4">
              <div className="text-left mb-4">
                <span className="text-[11px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5" /> Ativação de Primeiro Acesso
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Introduza o seu e-mail institucional interno. Se o seu e-mail estiver cadastrado
                  como utilizador interno no sistema, enviaremos de imediato uma{" "}
                  <strong>palavra-passe temporária de 8 caracteres</strong> para a sua caixa de entrada.
                </p>
              </div>

              {successMsg ? (
                <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-teal-500 text-white flex items-center justify-center mx-auto shadow-sm">
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-teal-950 dark:text-teal-200">
                      Verifique o seu E-mail!
                    </h3>
                    <p className="text-xs text-teal-800/80 dark:text-teal-300/80 mt-1">
                      Aceda ao seu e-mail (<strong>{email}</strong>) para copiar o código de 8
                      caracteres e inicie sessão para escolher a sua palavra-passe definitiva.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("LOGIN");
                      setSuccessMsg(null);
                      setErrorMsg(null);
                    }}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Ir para o Início de Sessão</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleFirstAccess} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      E-mail Institucional Cadastrado
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        placeholder="nome.sobrenome@enging.pt"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Enviar Senha Temporária por E-mail</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("LOGIN");
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Voltar ao Início de Sessão</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* 3. CHANGE PASSWORD (FIRST ACCESS FORCED CHANGE)                 */}
          {/* =============================================================== */}
          {mode === "CHANGE_PASSWORD" && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs">
                <span className="font-bold block mb-1">Definição de Nova Senha Obrigatória:</span>
                Como este é o seu primeiro acesso, deve alterar a senha temporária para uma palavra-passe pessoal e segura.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Palavra-Passe Temporária (8 Caracteres)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="Código de 8 caracteres recebido"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value.trim())}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nova Palavra-Passe Definitiva
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Confirmar Nova Palavra-Passe
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    placeholder="Repita a nova palavra-passe"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-teal-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Gravar Nova Palavra-Passe e Entrar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("LOGIN");
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 font-bold transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cancelar e Voltar</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
