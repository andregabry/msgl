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
  Layers,
  ArrowDown,
  ArrowUp,
  X,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { toast, dialog, showLoading, hideLoading, confirmAction } from "@/lib/swal";
import GoogleChatAuth from "@/components/GoogleChatAuth";

const ARCHIVE_YEARS = [
  "2026",
  "2025",
  "2024",
  "2023",
  "2022",
  "2021",
  "2020",
  "2019",
  "2018",
  "2017",
  "2016",
  "2015",
  "2014",
  "2013",
];

export default function GoogleChatPortalPage() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Spaces and messages state
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Pagination & in-space search state
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [totalSpaceMessages, setTotalSpaceMessages] = useState<number>(0);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSearchActive, setConversationSearchActive] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [previewImage, setPreviewImage] = useState<{ url: string; filename: string } | null>(null);
  const timelineRef = React.useRef<HTMLDivElement>(null);

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
    setSessionLoading(true);
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const d = await res.json();
        setCurrentUser(d.user || null);
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error("Falha ao obter sessão:", err);
      setCurrentUser(null);
    } finally {
      setSessionLoading(false);
    }
  };

  // Exit simulation and restore Admin session
  const handleExitSimulation = async () => {
    showLoading("A Encerrar Simulação...", "A restaurar a sua sessão de administrador...");
    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitSimulation: true }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Sessão Restaurada!", "A regressar ao painel administrativo...");
        setTimeout(() => {
          window.location.href = "https://msgl.enging.pt";
        }, 300);
      } else {
        dialog.error("Erro", data.error || "Não foi possível restaurar a sessão de administrador.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Logout session
  const handleLogout = async () => {
    const confirm = await confirmAction({
      title: "Terminar Sessão?",
      text: "Deseja sair do Portal Google Chat?",
      confirmText: "Terminar Sessão",
      cancelText: "Cancelar",
      icon: "question",
    });
    if (!confirm) return;

    showLoading("A Terminar Sessão...", "A limpar sessão ativa...");
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      hideLoading();
      setCurrentUser(null);
      setSpaces([]);
      setSelectedSpace(null);
      setMessages([]);
    } catch (err) {
      hideLoading();
      setCurrentUser(null);
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
      let url = `/api/chat/spaces/${spaceId}/messages?limit=5000&order=${sortOrder}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
      if (conversationSearchActive) url += `&q=${encodeURIComponent(conversationSearchActive)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = data.messages || [];
        setMessages(list);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.hasMore);
        setTotalSpaceMessages(data.totalCount ?? list.length);

        // Auto-scroll to bottom so latest sent/received messages appear immediately
        setTimeout(() => {
          if (timelineRef.current) {
            timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (err) {
      console.error("Erro ao carregar mensagens:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Load more messages
  const loadMoreMessages = async () => {
    if (!selectedSpace || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      let url = `/api/chat/spaces/${selectedSpace.id}/messages?limit=2000&cursor=${encodeURIComponent(nextCursor)}&order=${sortOrder}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
      if (conversationSearchActive) url += `&q=${encodeURIComponent(conversationSearchActive)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const more = data.messages || [];
        setMessages((prev) => [...prev, ...more]);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.hasMore);
        if (data.totalCount !== undefined) {
          setTotalSpaceMessages(data.totalCount);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar mais mensagens:", err);
      toast.error("Erro", "Não foi possível carregar mais mensagens.");
    } finally {
      setLoadingMore(false);
    }
  };

  // Load all messages
  const loadAllMessages = async () => {
    if (!selectedSpace || loadingAll) return;
    setLoadingAll(true);
    showLoading("A Carregar Histórico Completo...", "A descarregar todas as mensagens desta conversa...");
    try {
      let url = `/api/chat/spaces/${selectedSpace.id}/messages?limit=5000&order=${sortOrder}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;
      if (conversationSearchActive) url += `&q=${encodeURIComponent(conversationSearchActive)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        let allMsgs = data.messages || [];
        let cur = data.nextCursor;

        while (cur) {
          let nextUrl = `/api/chat/spaces/${selectedSpace.id}/messages?limit=5000&cursor=${encodeURIComponent(cur)}&order=${sortOrder}`;
          if (startDate) nextUrl += `&startDate=${encodeURIComponent(startDate)}`;
          if (endDate) nextUrl += `&endDate=${encodeURIComponent(endDate)}`;
          if (conversationSearchActive) nextUrl += `&q=${encodeURIComponent(conversationSearchActive)}`;

          const nextRes = await fetch(nextUrl);
          if (!nextRes.ok) break;
          const nextData = await nextRes.json();
          allMsgs = [...allMsgs, ...(nextData.messages || [])];
          cur = nextData.nextCursor;
        }

        setMessages(allMsgs);
        setNextCursor(null);
        setHasMore(false);
        setTotalSpaceMessages(allMsgs.length);
        hideLoading();
        toast.success("Histórico Carregado", `Total de ${allMsgs.length} mensagens carregadas.`);
      } else {
        hideLoading();
      }
    } catch (err) {
      hideLoading();
      console.error("Erro ao carregar todas as mensagens:", err);
      toast.error("Erro", "Falha ao carregar todo o histórico.");
    } finally {
      setLoadingAll(false);
    }
  };

  // Date & Year Filter Handlers
  const handleYearSelect = (year: string) => {
    setSelectedYear(year);
    if (year === "ALL") {
      setStartDate("");
      setEndDate("");
    } else if (year === "CUSTOM") {
      // Keep existing custom dates
    } else {
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    }
  };

  const updateYearFromDates = (start: string, end: string) => {
    if (!start && !end) {
      setSelectedYear("ALL");
      return;
    }
    if (start && end && start.endsWith("-01-01") && end.endsWith("-12-31")) {
      const yStart = start.slice(0, 4);
      const yEnd = end.slice(0, 4);
      if (yStart === yEnd && ARCHIVE_YEARS.includes(yStart)) {
        setSelectedYear(yStart);
        return;
      }
    }
    setSelectedYear("CUSTOM");
  };

  const handleCustomStartDate = (val: string) => {
    setStartDate(val);
    updateYearFromDates(val, endDate);
  };

  const handleCustomEndDate = (val: string) => {
    setEndDate(val);
    updateYearFromDates(startDate, val);
  };

  const handleClearDateFilter = () => {
    setSelectedYear("ALL");
    setStartDate("");
    setEndDate("");
  };

  // In-Conversation Search Handlers
  const handleConversationSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setConversationSearchActive(conversationSearch.trim());
  };

  const handleClearConversationSearch = () => {
    setConversationSearch("");
    setConversationSearchActive("");
  };

  // Scroll helpers
  const scrollToBottom = () => {
    if (timelineRef.current) {
      timelineRef.current.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    if (timelineRef.current) {
      timelineRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Helper to highlight matching text in message bubbles
  const renderMessageContent = (text: string) => {
    const term = conversationSearchActive || searchQuery;
    if (!term || !term.trim()) {
      return text;
    }
    const safeTerm = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${safeTerm})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="bg-amber-300 dark:bg-amber-500/40 text-amber-950 dark:text-amber-200 px-1 py-0.5 rounded font-bold"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Attachment helper functions
  const isImageAttachment = (filename?: string, mimeType?: string) => {
    if (mimeType?.toLowerCase().startsWith("image/")) return true;
    if (!filename) return false;
    const ext = filename.toLowerCase().split(".").pop();
    return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext || "");
  };

  const isViewableInBrowser = (filename?: string, mimeType?: string) => {
    if (isImageAttachment(filename, mimeType)) return true;
    if (mimeType?.toLowerCase().includes("pdf")) return true;
    if (mimeType?.toLowerCase().includes("text/")) return true;
    const ext = filename?.toLowerCase().split(".").pop();
    return ["pdf", "txt", "html", "json", "csv"].includes(ext || "");
  };

  const getFileIcon = (filename?: string, mimeType?: string) => {
    const ext = filename?.toLowerCase().split(".").pop() || "";
    if (ext === "pdf" || mimeType?.includes("pdf")) {
      return <FileText className="w-4 h-4 text-rose-500" />;
    }
    if (["xls", "xlsx", "csv", "xlsb"].includes(ext)) {
      return <FileText className="w-4 h-4 text-emerald-500" />;
    }
    if (["doc", "docx"].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-500" />;
    }
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
      return <Paperclip className="w-4 h-4 text-amber-500" />;
    }
    return <FileText className="w-4 h-4 text-[#e95c0c]" />;
  };

  const formatFileSize = (bytes?: string | number) => {
    const num = Number(bytes);
    if (!num || isNaN(num) || num <= 0) return "Ficheiro anexado";
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
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
        const results = data.results || [];
        setMessages(results);
        setNextCursor(null);
        setHasMore(false);
        setTotalSpaceMessages(results.length);
        if (results.length === 0) {
          toast.info("Nenhuma mensagem encontrada", "Tente pesquisar por outros termos ou datas.");
        } else {
          toast.success("Pesquisa Concluída", `${results.length} mensagens encontradas.`);
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
  }, [selectedSpace, startDate, endDate, conversationSearchActive, sortOrder]);

  const filteredSpaces = spaces.filter((s) => {
    if (spaceFilter !== "ALL" && s.spaceType !== spaceFilter) return false;
    if (spaceSearch.trim() && !s.displayName?.toLowerCase().includes(spaceSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  const isGestorUser =
    currentUser?.isGestor ||
    ["ADMIN", "BACKUP_OPERATOR", "MIGRATION_OPERATOR", "AUDITOR"].includes(currentUser?.role || "");

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d131a]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">A validar sessão...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <GoogleChatAuth
        onSuccess={(u) => {
          setCurrentUser(u);
          fetchSpaces();
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen max-h-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-[#0d131a] text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* =================================================================== */}
      {/* SIMULATION ALERT BANNER (Only when impersonating a user)            */}
      {/* =================================================================== */}
      {currentUser?.isSimulated && (
        <aside
          aria-label="Aviso de Modo Simulação"
          className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/15 border-b border-amber-500/30 px-4 sm:px-8 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-950 dark:text-amber-200 shrink-0 z-40 backdrop-blur-md"
        >
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldAlert className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-black uppercase tracking-wider text-[11px] text-amber-700 dark:text-amber-400 mr-2">
                Modo de Simulação Ativo
              </span>
              <span>
                A visualizar o portal como <strong>{currentUser.displayName}</strong> ({currentUser.email})
              </span>
              {currentUser.impersonator && (
                <span className="hidden md:inline text-amber-700/80 dark:text-amber-400/80 ml-1.5 font-medium">
                  — Administrador: <strong>{currentUser.impersonator.displayName}</strong>
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleExitSimulation}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
            title="Encerrar simulação e restaurar a sessão de administrador"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Encerrar Simulação e Voltar ao Admin</span>
          </button>
        </aside>
      )}

      {/* =================================================================== */}
      {/* DEDICATED PORTAL HEADER                                             */}
      {/* =================================================================== */}
      <header className="top-navbar bg-white dark:bg-[#15202c] border-b border-slate-200 dark:border-slate-800 shrink-0 z-30 px-4 sm:px-8 py-2.5 shadow-xs">
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
              {currentUser?.isSimulated && (
                <button
                  onClick={handleExitSimulation}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  title="Sair da Simulação"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Admin</span>
                </button>
              )}
              {isGestorUser && !currentUser?.isSimulated && (
                <a
                  href="https://msgl.enging.pt"
                  className="px-2 py-1 bg-[#e95c0c]/15 text-[#e95c0c] border border-[#e95c0c]/30 rounded-lg text-[11px] font-bold flex items-center gap-1"
                  title="Painel Gestor MSGL"
                >
                  <Layers className="w-3 h-3" />
                  <span>MSGL</span>
                </a>
              )}

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

            {/* Admin Return / Exit Simulation Button */}
            {currentUser?.isSimulated ? (
              <button
                onClick={handleExitSimulation}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                title="Encerrar simulação e voltar ao painel de administração"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Voltar ao Admin</span>
              </button>
            ) : isGestorUser ? (
              <a
                href="https://msgl.enging.pt"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e95c0c]/10 hover:bg-[#e95c0c]/20 text-[#e95c0c] text-xs font-bold rounded-xl transition border border-[#e95c0c]/30"
                title="Aceder ao Painel Gestor MSGL (msgl.enging.pt)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Painel Gestor MSGL</span>
              </a>
            ) : null}

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

              <button
                onClick={currentUser?.isSimulated ? handleExitSimulation : handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer ml-1"
                title={currentUser?.isSimulated ? "Encerrar Simulação e Voltar ao Admin" : "Terminar Sessão"}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* MAIN PORTAL WORKSPACE                                              */}
      {/* =================================================================== */}
      <main className="flex-1 min-h-0 w-full max-w-7xl mx-auto p-2 sm:p-4 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 h-full bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row overflow-hidden">
          {/* --------------------------------------------------------------- */}
          {/* LEFT COLUMN: CONVERSATIONS LIST & SEARCH                        */}
          {/* --------------------------------------------------------------- */}
          <div className="w-full md:w-80 lg:w-96 h-full border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/60 dark:bg-[#121921]/60 overflow-hidden shrink-0">
            {/* Filter by Space Type */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202c] flex items-center gap-1.5 shrink-0">
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
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
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
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
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
                      onClick={() => {
                        setSelectedSpace(s);
                        setConversationSearch("");
                        setConversationSearchActive("");
                      }}
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
          <div className="flex-1 min-h-0 h-full flex flex-col bg-white dark:bg-[#15202c] overflow-hidden">
            {selectedSpace ? (
              <>
                {/* Space Header & Filters Bar */}
                <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#121921]/70 flex flex-col gap-3 shrink-0">
                  {/* Top Row: Conversation Title & Counter */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-[#e95c0c] flex items-center justify-center font-black shrink-0">
                        {selectedSpace.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-black text-slate-800 dark:text-white truncate">
                            {selectedSpace.displayName}
                          </h2>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                            {selectedSpace.spaceType === "DIRECT_MESSAGE" ? "Conversa Direta" : "Espaço"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                          <span>
                            A exibir <strong>{messages.length}</strong> de <strong>{totalSpaceMessages}</strong> mensagens
                          </span>
                          {hasMore && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              (Mais {totalSpaceMessages - messages.length} disponíveis)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Jump & Sort Buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                      <button
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center gap-1 transition cursor-pointer"
                        title={sortOrder === "asc" ? "Mudar para mais recentes primeiro" : "Mudar para mais antigas primeiro"}
                      >
                        <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                        <span>{sortOrder === "asc" ? "Mais antigas primeiro" : "Mais recentes primeiro"}</span>
                      </button>
                      <button
                        onClick={scrollToTop}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer transition"
                        title="Ir para o topo"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={scrollToBottom}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15202c] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer transition"
                        title="Ir para o fim"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Second Row: In-Conversation Search & Date Presets */}
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                    {/* IN-CONVERSATION SEARCH INPUT */}
                    <form
                      onSubmit={handleConversationSearchSubmit}
                      className="relative flex-1 max-w-full lg:max-w-md flex items-center"
                    >
                      <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Pesquisar mensagens nesta conversa..."
                        value={conversationSearch}
                        onChange={(e) => setConversationSearch(e.target.value)}
                        className="w-full pl-8 pr-16 py-1.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#e95c0c]"
                      />
                      {conversationSearch && (
                        <button
                          type="button"
                          onClick={handleClearConversationSearch}
                          className="absolute right-12 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          title="Limpar texto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="submit"
                        className="absolute right-1 px-2.5 py-1 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-[11px] font-bold rounded-md transition cursor-pointer"
                      >
                        Buscar
                      </button>
                    </form>

                    {/* UNIFIED DATE & YEAR FILTER FIELD */}
                    <div className="flex items-center bg-white dark:bg-[#121921] border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1 text-xs shadow-2xs divide-x divide-slate-200 dark:divide-slate-700">
                      {/* Integrated Year Selector */}
                      <div className="flex items-center gap-1.5 pr-2.5">
                        <Calendar className="w-3.5 h-3.5 text-[#e95c0c] shrink-0" />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Ano:</span>
                        <select
                          value={selectedYear}
                          onChange={(e) => handleYearSelect(e.target.value)}
                          className="bg-transparent text-slate-800 dark:text-slate-100 text-[11px] font-bold focus:outline-none cursor-pointer pr-1"
                          title="Selecionar ano de mensagens arquivadas"
                        >
                          <option value="ALL" className="bg-white dark:bg-[#15202c] text-slate-800 dark:text-slate-100">
                            Todos
                          </option>
                          {ARCHIVE_YEARS.map((yr) => (
                            <option key={yr} value={yr} className="bg-white dark:bg-[#15202c] text-slate-800 dark:text-slate-100">
                              {yr}
                            </option>
                          ))}
                          <option value="CUSTOM" className="bg-white dark:bg-[#15202c] text-slate-800 dark:text-slate-100">
                            Personalizado
                          </option>
                        </select>
                      </div>

                      {/* Exact Date Range Inputs */}
                      <div className="flex items-center gap-1.5 pl-2.5 text-[11px]">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => handleCustomStartDate(e.target.value)}
                          className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer text-[11px]"
                          title="Data Inicial"
                        />
                        <span className="text-slate-400 text-[10px] font-medium">até</span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => handleCustomEndDate(e.target.value)}
                          className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer text-[11px]"
                          title="Data Final"
                        />

                        {(startDate || endDate || selectedYear !== "ALL") && (
                          <button
                            type="button"
                            onClick={handleClearDateFilter}
                            className="ml-1 p-0.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition cursor-pointer rounded"
                            title="Limpar filtro de data e ano"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active Search / Filter Banner if In-Conversation Search is Active */}
                  {conversationSearchActive && (
                    <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <Search className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>
                          Filtro de busca ativo: <strong>&quot;{conversationSearchActive}&quot;</strong> ({messages.length} mensagem(ns) encontrada(s))
                        </span>
                      </div>
                      <button
                        onClick={handleClearConversationSearch}
                        className="font-bold underline text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 cursor-pointer text-[11px]"
                      >
                        Remover filtro de busca
                      </button>
                    </div>
                  )}
                </div>

                {/* Messages Timeline */}
                <div ref={timelineRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {loadingMessages ? (
                    <div className="py-20 text-center text-xs text-slate-400">
                      <div className="animate-spin w-6 h-6 border-2 border-[#e95c0c] border-t-transparent rounded-full mx-auto mb-2" />
                      A carregar histórico da conversa...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-24 text-center">
                      <MessageSquare className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {conversationSearchActive
                          ? `Nenhuma mensagem encontrada para "${conversationSearchActive}"`
                          : (startDate || endDate || selectedYear !== "ALL")
                          ? `Nenhuma mensagem encontrada para o período selecionado (${selectedYear !== "ALL" && selectedYear !== "CUSTOM" ? selectedYear : `${startDate} a ${endDate}`})`
                          : "Nenhuma mensagem arquivada nesta conversa"}
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                        {conversationSearchActive ? (
                          <button
                            onClick={handleClearConversationSearch}
                            className="text-[#e95c0c] font-bold underline hover:text-[#c84c06] cursor-pointer"
                          >
                            Clique aqui para limpar a pesquisa e ver todas as mensagens.
                          </button>
                        ) : (startDate || endDate || selectedYear !== "ALL") ? (
                          <button
                            onClick={handleClearDateFilter}
                            className="text-[#e95c0c] font-bold underline hover:text-[#c84c06] cursor-pointer"
                          >
                            Clique aqui para limpar o filtro de data e ver todas as mensagens.
                          </button>
                        ) : (
                          "Se este canal contém backups recentes, certifique-se de que a exportação do Google Chat foi processada."
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
                      {messages.map((m) => {
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
                                {renderMessageContent(m.text)}
                              </p>

                              {/* Attachments Section */}
                              {m.attachments && m.attachments.length > 0 && (
                                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60 space-y-2">
                                  {m.attachments.map((att: any) => {
                                    const isImg = isImageAttachment(att.filename, att.mimeType);

                                    if (isImg) {
                                      return (
                                        <div
                                          key={att.id}
                                          className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700/80 bg-white/60 dark:bg-[#121921]/60 shadow-2xs max-w-sm"
                                        >
                                          {/* Inline Image Preview */}
                                          <div
                                            onClick={() =>
                                              setPreviewImage({
                                                url: `/api/chat/attachments/${att.id}?view=true`,
                                                filename: att.filename,
                                              })
                                            }
                                            className="relative group cursor-pointer bg-slate-100 dark:bg-black/40 flex items-center justify-center min-h-[120px] max-h-64 overflow-hidden"
                                          >
                                            <img
                                              src={`/api/chat/attachments/${att.id}?view=true`}
                                              alt={att.filename || "Imagem"}
                                              loading="lazy"
                                              className="w-full h-auto max-h-64 object-contain transition duration-200 group-hover:scale-102"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center gap-1.5 text-white text-xs font-bold">
                                              <Eye className="w-4 h-4" />
                                              <span>Ver imagem</span>
                                            </div>
                                          </div>

                                          {/* Image Footer with Name & Actions */}
                                          <div className="p-2 bg-white/95 dark:bg-[#15202c]/95 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2 text-xs">
                                            <div className="truncate min-w-0">
                                              <p className="font-bold text-slate-800 dark:text-slate-200 truncate text-[11px]" title={att.filename}>
                                                {att.filename}
                                              </p>
                                              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                                {formatFileSize(att.bytes)}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <a
                                                href={`/api/chat/attachments/${att.id}?view=true`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
                                                title="Abrir imagem numa nova aba"
                                              >
                                                <Eye className="w-3.5 h-3.5" />
                                              </a>
                                              <a
                                                href={`/api/chat/attachments/${att.id}/download`}
                                                download={att.filename}
                                                className="p-1.5 bg-[#e95c0c]/10 hover:bg-[#e95c0c] text-[#e95c0c] hover:text-white rounded-lg transition"
                                                title="Descarregar imagem"
                                              >
                                                <Download className="w-3.5 h-3.5" />
                                              </a>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }

                                    // Document / General File Card
                                    return (
                                      <div
                                        key={att.id}
                                        className="p-2.5 bg-white/90 dark:bg-[#15202c]/90 border border-slate-200 dark:border-slate-700/80 rounded-xl flex items-center justify-between gap-2.5 text-xs shadow-2xs hover:border-[#e95c0c]/40 transition"
                                      >
                                        <div className="flex items-center gap-2.5 truncate min-w-0">
                                          <div className="w-8 h-8 rounded-lg bg-orange-500/10 dark:bg-orange-500/20 text-[#e95c0c] flex items-center justify-center shrink-0">
                                            {getFileIcon(att.filename, att.mimeType)}
                                          </div>
                                          <div className="truncate min-w-0">
                                            <p className="font-bold text-slate-800 dark:text-slate-200 truncate text-xs" title={att.filename}>
                                              {att.filename}
                                            </p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                              {formatFileSize(att.bytes)}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {isViewableInBrowser(att.filename, att.mimeType) && (
                                            <a
                                              href={`/api/chat/attachments/${att.id}?view=true`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white transition flex items-center gap-1 text-[11px] font-medium"
                                              title="Visualizar documento"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                              <span className="hidden sm:inline">Ver</span>
                                            </a>
                                          )}
                                          <a
                                            href={`/api/chat/attachments/${att.id}/download`}
                                            download={att.filename}
                                            className="p-1.5 bg-[#e95c0c]/10 hover:bg-[#e95c0c] text-[#e95c0c] hover:text-white rounded-lg transition flex items-center gap-1 text-[11px] font-bold"
                                            title="Descarregar ficheiro"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Descarregar</span>
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Pagination & Load More Controls */}
                      {hasMore && (
                        <div className="p-4 bg-slate-50 dark:bg-[#121921] border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-2 mt-4 shadow-xs">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            A exibir <strong>{messages.length}</strong> de <strong>{totalSpaceMessages}</strong> mensagens arquivadas nesta conversa.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              onClick={loadMoreMessages}
                              disabled={loadingMore || loadingAll}
                              className="px-3.5 py-1.5 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
                            >
                              {loadingMore ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5" />
                              )}
                              <span>Carregar Mais (+100)</span>
                            </button>

                            {totalSpaceMessages > messages.length && (
                              <button
                                onClick={loadAllMessages}
                                disabled={loadingMore || loadingAll}
                                className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                              >
                                {loadingAll ? (
                                  <div className="w-3.5 h-3.5 border-2 border-slate-700 dark:border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                )}
                                <span>Carregar Todas ({totalSpaceMessages - messages.length} restantes)</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
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

      {/* Image Preview Lightbox Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between gap-3 text-white">
              <span className="font-bold text-xs truncate max-w-md">
                {previewImage.filename}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url.replace("view=true", "download=true")}
                  download={previewImage.filename}
                  className="p-1.5 bg-[#e95c0c] hover:bg-[#c84c06] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                  title="Descarregar imagem"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descarregar</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                  title="Fechar visualização"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center max-h-[calc(90vh-60px)]">
              <img
                src={previewImage.url}
                alt={previewImage.filename}
                className="max-h-[calc(90vh-80px)] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
