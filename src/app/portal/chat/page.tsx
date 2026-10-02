"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Search,
  Users,
  Paperclip,
  Calendar,
  Hash,
  Download,
  User,
  ArrowRight,
  Filter,
  LogOut,
  Sun,
  Moon,
  ShieldAlert,
  ArrowLeft,
  ChevronRight,
  Clock,
  Sparkles,
  FileText,
} from "lucide-react";
import { toast, dialog } from "@/lib/swal";

export default function GoogleChatPortalPage() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Spaces and messages state
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filters
  const [spaceFilter, setSpaceFilter] = useState<"ALL" | "DIRECT_MESSAGE" | "SPACE">("ALL");
  const [spaceSearch, setSpaceSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Sync theme
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");

    const onThemeChange = () => {
      const dark = document.documentElement.classList.contains("dark");
      setTheme(dark ? "dark" : "light");
    };
    window.addEventListener("themechange", onThemeChange);
    return () => window.removeEventListener("themechange", onThemeChange);
  }, []);

  const toggleTheme = (mode: "light" | "dark") => {
    setTheme(mode);
    if (mode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("migrate_hub_theme", mode);
    } catch (e) {}
    window.dispatchEvent(new Event("themechange"));
  };

  // Fetch current user session
  const fetchSession = async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const d = await res.json();
        setCurrentUser(d.user || null);
      }
    } catch (err) {
      console.error("Falha ao obter sessão:", err);
    }
  };

  // Fetch accessible chat spaces
  const fetchSpaces = async () => {
    setLoadingSpaces(true);
    try {
      const res = await fetch("/api/chat/spaces");
      if (res.ok) {
        const data = await res.json();
        const list = data.spaces || [];
        setSpaces(list);
        if (list.length > 0 && !selectedSpace) {
          setSelectedSpace(list[0]);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar espaços:", err);
    } finally {
      setLoadingSpaces(false);
    }
  };

  // Fetch messages of selected space
  const fetchMessages = async (spaceId: string) => {
    setLoadingMessages(true);
    try {
      let url = `/api/chat/spaces/${spaceId}/messages?limit=100`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Search across messages
  const handleGlobalSearch = async () => {
    if (!searchQuery.trim()) {
      if (selectedSpace) fetchMessages(selectedSpace.id);
      return;
    }

    setLoadingMessages(true);
    try {
      let url = `/api/chat/search?q=${encodeURIComponent(searchQuery)}&limit=100`;
      if (selectedSpace) url += `&spaceId=${selectedSpace.id}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.results || []);
        if (data.results && data.results.length === 0) {
          toast.info("Nenhuma mensagem encontrada", "Tente pesquisar por outros termos ou datas.");
        } else {
          toast.success("Pesquisa Concluída", `${data.results.length} mensagens encontradas.`);
        }
      } else {
        toast.error("Erro na Pesquisa", "Não foi possível efetuar a busca no arquivo histórico.");
      }
    } catch (err: any) {
      toast.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchSession();
    fetchSpaces();
  }, []);

  useEffect(() => {
    if (selectedSpace) {
      fetchMessages(selectedSpace.id);
    }
  }, [selectedSpace, startDate, endDate]);

  const filteredSpaces = spaces.filter((s) => {
    if (spaceFilter !== "ALL" && s.spaceType !== spaceFilter) return false;
    if (spaceSearch.trim() && !s.displayName?.toLowerCase().includes(spaceSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  const isAdmin = currentUser?.role === "ADMIN";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0d131a] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* =================================================================== */}
      {/* DEDICATED PORTAL HEADER                                             */}
      {/* =================================================================== */}
      <header className="top-navbar bg-white dark:bg-[#15202c] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Brand & Portal Badge */}
          <div className="flex items-center gap-3.5 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-500/20 shadow-xs">
                <MessageSquare className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-tight text-[#223546] dark:text-white">
                    Google Chat Archive
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    Portal do Colaborador
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  Consulta e pesquisa do histórico arquivado de conversas e anexos
                </p>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex md:hidden items-center gap-2">
              <div className="flex bg-slate-100 dark:bg-[#121921] p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  onClick={() => toggleTheme("light")}
                  className={`p-1.5 rounded-md ${theme === "light" ? "bg-white text-amber-500 shadow-xs" : "text-slate-400"}`}
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleTheme("dark")}
                  className={`p-1.5 rounded-md ${theme === "dark" ? "bg-slate-700 text-indigo-400 shadow-xs" : "text-slate-400"}`}
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Center Search Input */}
          <div className="w-full md:w-96 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar em todas as conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGlobalSearch()}
              className="w-full pl-10 pr-24 py-2 bg-slate-100 dark:bg-[#121921] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#e95c0c] transition"
            />
            <button
              onClick={handleGlobalSearch}
              className="absolute right-1.5 top-1.5 px-3 py-1 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-[11px] font-bold rounded-lg transition"
            >
              Buscar
            </button>
          </div>

          {/* Right User Bar & Controls */}
          <div className="hidden md:flex items-center gap-3">
            {/* Theme Toggle */}
            <div className="flex bg-slate-100 dark:bg-[#121921] p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <button
                onClick={() => toggleTheme("light")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition text-[11px] ${
                  theme === "light"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Claro</span>
              </button>
              <button
                onClick={() => toggleTheme("dark")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-bold transition text-[11px] ${
                  theme === "dark"
                    ? "bg-slate-700 text-white shadow-xs"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Escuro</span>
              </button>
            </div>

            {/* Admin Return Button (Only visible for Admins) */}
            {isAdmin && (
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition border border-slate-200 dark:border-slate-700"
                title="Voltar ao Hub Administrativo Completo"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Hub Admin</span>
              </Link>
            )}

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-[#e95c0c]/10 text-[#e95c0c] border border-[#e95c0c]/20 flex items-center justify-center font-black text-xs">
                {currentUser?.displayName?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="text-left text-xs">
                <div className="font-bold text-slate-800 dark:text-white leading-tight">
                  {currentUser?.displayName || "Colaborador"}
                </div>
                <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                  {currentUser?.email || ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* MAIN PORTAL WORKSPACE                                              */}
      {/* =================================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        <div className="flex-1 bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row overflow-hidden min-h-[calc(100vh-160px)]">
          {/* --------------------------------------------------------------- */}
          {/* LEFT COLUMN: CONVERSATIONS LIST & SEARCH                        */}
          {/* --------------------------------------------------------------- */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/60 dark:bg-[#121921]/60">
            {/* Filter by Space Type */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202c] flex items-center gap-1.5">
              <button
                onClick={() => setSpaceFilter("ALL")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition text-center ${
                  spaceFilter === "ALL"
                    ? "bg-[#e95c0c] text-white shadow-xs"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Todas ({spaces.length})
              </button>
              <button
                onClick={() => setSpaceFilter("DIRECT_MESSAGE")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition text-center ${
                  spaceFilter === "DIRECT_MESSAGE"
                    ? "bg-[#e95c0c] text-white shadow-xs"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Diretas (DMs)
              </button>
              <button
                onClick={() => setSpaceFilter("SPACE")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition text-center ${
                  spaceFilter === "SPACE"
                    ? "bg-[#e95c0c] text-white shadow-xs"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                Espaços / Canais
              </button>
            </div>

            {/* Quick Filter Box */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por nome do canal ou contacto..."
                  value={spaceSearch}
                  onChange={(e) => setSpaceSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#121921] border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:border-[#e95c0c]"
                />
              </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {loadingSpaces ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <div className="animate-spin w-5 h-5 border-2 border-[#e95c0c] border-t-transparent rounded-full mx-auto mb-2" />
                  A carregar conversas arquivadas...
                </div>
              ) : filteredSpaces.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Nenhuma conversa encontrada.
                </div>
              ) : (
                filteredSpaces.map((s) => {
                  const isSelected = selectedSpace?.id === s.id;
                  const isDm = s.spaceType === "DIRECT_MESSAGE";

                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSpace(s)}
                      className={`w-full p-3.5 text-left flex items-start gap-3 transition cursor-pointer ${
                        isSelected
                          ? "bg-orange-50/80 dark:bg-orange-950/20 border-l-4 border-[#e95c0c]"
                          : "hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          isDm
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                            : "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                        }`}
                      >
                        {isDm ? <User className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold text-xs truncate ${
                              isSelected
                                ? "text-[#e95c0c] dark:text-orange-400"
                                : "text-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {s.displayName}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                          <span>{s._count?.messages ?? 0} msgs</span>
                          <span>•</span>
                          <span className="capitalize">{isDm ? "Conversa Direta" : "Espaço de Equipa"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* RIGHT COLUMN: ACTIVE CONVERSATION TIMELINE                     */}
          {/* --------------------------------------------------------------- */}
          <div className="flex-1 flex flex-col bg-white dark:bg-[#15202c]">
            {selectedSpace ? (
              <>
                {/* Space Header & Filters Bar */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50/50 dark:bg-[#121921]/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-[#e95c0c] flex items-center justify-center font-black">
                      {selectedSpace.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-800 dark:text-white">
                        {selectedSpace.displayName}
                      </h2>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-2">
                        <span>{selectedSpace.spaceType === "DIRECT_MESSAGE" ? "Direct Message" : "Google Chat Space"}</span>
                        <span>•</span>
                        <span>{messages.length} mensagens no histórico</span>
                      </div>
                    </div>
                  </div>

                  {/* Date Filters */}
                  <div className="flex items-center gap-2 w-full lg:w-auto">
                    <div className="flex items-center gap-1.5 bg-white dark:bg-[#121921] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none text-[11px]"
                        title="Data Inicial"
                      />
                      <span className="text-slate-400">até</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none text-[11px]"
                        title="Data Final"
                      />
                    </div>

                    {(startDate || endDate) && (
                      <button
                        onClick={() => {
                          setStartDate("");
                          setEndDate("");
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Timeline */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {loadingMessages ? (
                    <div className="py-20 text-center text-xs text-slate-400">
                      <div className="animate-spin w-6 h-6 border-2 border-[#e95c0c] border-t-transparent rounded-full mx-auto mb-2" />
                      A carregar histórico da conversa...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-24 text-center">
                      <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        Nenhuma mensagem arquivada nesta conversa
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                        Se este canal contém backups recentes, certifique-se de que a exportação do Google Chat foi processada.
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isCurrentUser =
                        currentUser?.email && m.senderEmail?.toLowerCase() === currentUser.email.toLowerCase();

                      return (
                        <div
                          key={m.id}
                          className={`flex items-start gap-3 ${isCurrentUser ? "flex-row-reverse" : "flex-row"}`}
                        >
                          {/* Avatar */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isCurrentUser
                                ? "bg-[#e95c0c] text-white"
                                : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {(m.senderName || m.senderEmail || "U").charAt(0).toUpperCase()}
                          </div>

                          {/* Message Bubble */}
                          <div
                            className={`max-w-[75%] rounded-2xl p-3.5 space-y-1.5 shadow-2xs ${
                              isCurrentUser
                                ? "bg-orange-500/10 dark:bg-orange-500/20 border border-orange-500/30 text-slate-800 dark:text-white"
                                : "bg-slate-100 dark:bg-[#121921] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[11px]">
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {m.senderName || m.senderEmail || "Desconhecido"}
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                {new Date(m.sentAt).toLocaleString("pt-PT", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>

                            {/* Message Content */}
                            <p className="text-xs leading-relaxed whitespace-pre-wrap break-words font-medium">
                              {m.text}
                            </p>

                            {/* Attachments Section */}
                            {m.attachments && m.attachments.length > 0 && (
                              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-1.5">
                                {m.attachments.map((att: any) => (
                                  <div
                                    key={att.id}
                                    className="p-2 bg-white/70 dark:bg-[#15202c]/70 border border-slate-200 dark:border-slate-700/80 rounded-lg flex items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <Paperclip className="w-3.5 h-3.5 text-[#e95c0c] shrink-0" />
                                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                                        {att.filename}
                                      </span>
                                      <span className="text-[10px] text-slate-400 shrink-0">
                                        ({(Number(att.bytes) / 1024).toFixed(1)} KB)
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => toast.info("Download de Anexo", `A transferir: ${att.filename}`)}
                                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
                                      title="Descarregar ficheiro arquivado"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4 border border-teal-500/20">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                  Selecione uma conversa para começar
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
                  Escolha um contacto na coluna da esquerda ou utilize a barra de pesquisa para encontrar palavras-chave.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
