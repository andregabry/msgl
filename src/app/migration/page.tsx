"use client";

import { createPortal } from "react-dom";

import React, { useEffect, useState, useMemo } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  Clock,
  Download,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Users,
  Mail,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Filter,
  Calendar,
  Contact,
  Sliders,
  Tag,
  Play,
  PlayCircle,
  Trash2,
  Search,
  Eye,
  Check,
  X,
  Layers,
  MoreVertical,
  Pencil,
  RotateCcw,
  Terminal,
  Pause,
  Wrench,
  Activity,
  Copy,
  FileCode,
  ChevronDown,
} from "lucide-react";
import { toast, dialog, confirmAction, showLoading, hideLoading } from "@/lib/swal";

type Direction = "GOOGLE_TO_MICROSOFT" | "MICROSOFT_TO_GOOGLE";
type Scope = "USERS" | "GROUPS";

const AVAILABLE_TYPES = [
  { id: "EMAILS", label: "E-mails & Mensagens", icon: Mail, desc: "Caixa de entrada, enviados, rascunhos e arquivo" },
  { id: "CALENDARS", label: "Calendários & Eventos", icon: Calendar, desc: "Reuniões, participantes, recorrência e lembretes" },
  { id: "CONTACTS", label: "Contactos & Agendas", icon: Contact, desc: "Nomes, telefones, e-mails e notas pessoais" },
  { id: "RULES", label: "Regras de Correio", icon: Sliders, desc: "Filtros de redirecionamento, pastas e etiquetas" },
  { id: "TAGS", label: "Tags / Labels / Categorias", icon: Tag, desc: "Mapeamento fiel de Labels ⇄ Pastas e Categorias" },
];

interface SearchableAccountOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface SearchableAccountSelectProps {
  options: SearchableAccountOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
}

function SearchableAccountSelect({
  options,
  value,
  onChange,
  placeholder = "-- Selecione uma conta --",
  searchPlaceholder = "Pesquisar por nome ou e-mail...",
  disabled = false,
}: SearchableAccountSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [options, query]);

  const selectedOpt = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  return (
    <div className={`relative w-full ${isOpen ? "z-50" : "z-10"}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 p-2.5 bg-white dark:bg-[#15202c] border rounded-lg text-left text-xs transition-all ${
          isOpen
            ? "border-[#e95c0c] ring-2 ring-[#e95c0c]/20 shadow-sm"
            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {selectedOpt ? (
            <div className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-slate-900 dark:text-white font-mono">
                {selectedOpt.label}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 truncate">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
              isOpen ? "rotate-180 text-[#e95c0c]" : ""
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header search bar */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-[#101720]">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-[#192433] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#e95c0c]"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsOpen(false);
                  } else if (e.key === "Enter" && filtered.length > 0) {
                    onChange(filtered[0].value);
                    setIsOpen(false);
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span>{filtered.length} de {options.length} opção(ões)</span>
              {query && <span className="text-[#e95c0c] font-semibold">Filtrando</span>}
            </div>
          </div>

          {/* List items */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100/60 dark:divide-slate-800/60 p-1">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                <Search className="w-5 h-5 mx-auto mb-1 opacity-40" />
                Nenhum resultado encontrado para &quot;{query}&quot;
              </div>
            ) : (
              filtered.slice(0, 150).map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? "bg-[#e95c0c]/10 text-[#e95c0c]"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs truncate flex items-center gap-1.5">
                        <span className={`font-mono ${isSelected ? "font-bold text-[#e95c0c]" : "font-medium"}`}>
                          {opt.label}
                        </span>
                        {opt.badge && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      {opt.sublabel && opt.sublabel !== opt.label && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate font-mono mt-0.5">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#e95c0c] shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export default function MigrationHubPage() {
  const [mounted, setMounted] = useState(false);
  // 1. Settings & Selection
  const [direction, setDirection] = useState<Direction>("GOOGLE_TO_MICROSOFT");
  const [scope, setScope] = useState<Scope>("USERS");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    "EMAILS",
    "CALENDARS",
    "CONTACTS",
    "RULES",
    "TAGS",
  ]);

  // Inventory data
  const [googleUsers, setGoogleUsers] = useState<any[]>([]);
  const [googleGroups, setGoogleGroups] = useState<any[]>([]);
  const [msUsers, setMsUsers] = useState<any[]>([]);
  const [msMailboxes, setMsMailboxes] = useState<any[]>([]);

  // Searchable account options
  const googleUserOptions: SearchableAccountOption[] = useMemo(() => {
    return googleUsers.map((u) => ({
      value: u.primaryEmail,
      label: `${u.fullName || u.name} (${u.primaryEmail})`,
      sublabel: u.primaryEmail,
    }));
  }, [googleUsers]);

  const googleGroupOptions: SearchableAccountOption[] = useMemo(() => {
    return googleGroups.map((g) => ({
      value: g.email,
      label: `${g.name} (${g.email})`,
      sublabel: `${g.directMembersCount ?? 0} membros`,
      badge: `${g.directMembersCount ?? 0} membros`,
    }));
  }, [googleGroups]);

  const msUserOptions: SearchableAccountOption[] = useMemo(() => {
    return msUsers.map((u) => ({
      value: u.userPrincipalName,
      label: `${u.displayName ? `${u.displayName} ` : ""}(${u.userPrincipalName})`,
      sublabel: u.mail && u.mail !== u.userPrincipalName ? `${u.userPrincipalName} • ${u.mail}` : u.userPrincipalName,
    }));
  }, [msUsers]);

  const msMailboxOptions: SearchableAccountOption[] = useMemo(() => {
    return msMailboxes.map((mb) => {
      const name = mb.displayName ? `${mb.displayName} ` : "";
      return {
        value: mb.primarySmtpAddress,
        label: `${name}(${mb.primarySmtpAddress})`,
        sublabel: `${mb.primarySmtpAddress} • ${mb.recipientType === "SHARED_MAILBOX" ? "SHARED MAILBOX" : mb.recipientType}`,
        badge: mb.recipientType === "SHARED_MAILBOX" ? "★ SHARED" : undefined,
      };
    });
  }, [msMailboxes]);

  const sourceOptions = useMemo(() => {
    if (direction === "GOOGLE_TO_MICROSOFT") {
      return scope === "USERS" ? googleUserOptions : googleGroupOptions;
    } else {
      return scope === "USERS" ? msUserOptions : msMailboxOptions;
    }
  }, [direction, scope, googleUserOptions, googleGroupOptions, msUserOptions, msMailboxOptions]);

  const sourcePlaceholder = useMemo(() => {
    if (direction === "GOOGLE_TO_MICROSOFT") {
      return scope === "USERS" ? "-- Selecione ou pesquise uma Conta Google --" : "-- Selecione ou pesquise um Grupo Google --";
    } else {
      return scope === "USERS" ? "-- Selecione ou pesquise uma Conta Microsoft --" : "-- Selecione ou pesquise uma Caixa Microsoft --";
    }
  }, [direction, scope]);

  const targetOptions = useMemo(() => {
    if (direction === "GOOGLE_TO_MICROSOFT") {
      return scope === "USERS" ? msUserOptions : msMailboxOptions;
    } else {
      return scope === "USERS" ? googleUserOptions : googleGroupOptions;
    }
  }, [direction, scope, googleUserOptions, googleGroupOptions, msUserOptions, msMailboxOptions]);

  const targetPlaceholder = useMemo(() => {
    if (direction === "GOOGLE_TO_MICROSOFT") {
      return scope === "USERS" ? "-- Selecione ou pesquise um Destino Microsoft --" : "-- Selecione ou pesquise uma Caixa Microsoft --";
    } else {
      return scope === "USERS" ? "-- Selecione ou pesquise uma Conta Google --" : "-- Selecione ou pesquise um Grupo Google --";
    }
  }, [direction, scope]);


  // Selected accounts
  const [sourceEmail, setSourceEmail] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [customSourceInput, setCustomSourceInput] = useState(false);
  const [customTargetInput, setCustomTargetInput] = useState(false);

  // Readiness status
  const [readiness, setReadiness] = useState<any | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Staging Queue (Mappings)
  const [queue, setQueue] = useState<any[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);

  // Migration Jobs
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [jobsSearch, setJobsSearch] = useState("");

  // Analysis Modal
  const [analysisModalData, setAnalysisModalData] = useState<any | null>(null);
  const [analyzingPair, setAnalyzingPair] = useState(false);

  // Purview Input Modal
  const [activeJobForPurview, setActiveJobForPurview] = useState<any | null>(null);
  const [purviewJobIdInput, setPurviewJobIdInput] = useState("");

  // Job Actions Dropdown (Floating / Not trapped in card)
  const [menuOpenJobId, setMenuOpenJobId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);

  // Edit Job Modal
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [editTargetEmail, setEditTargetEmail] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPurviewJobId, setEditPurviewJobId] = useState("");
  const [editSelectedTypes, setEditSelectedTypes] = useState<string[]>([]);

  // Real-time Logs, Execution & Auto-Repair State
  const [liveLogsJob, setLiveLogsJob] = useState<any | null>(null);
  const [logsData, setLogsData] = useState<{ job: any; events: any[]; failedItems: any[] } | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<"ALL" | "INFO" | "SUCCESS" | "WARNING" | "ERROR">("ALL");
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);
  const [diagnosingJobId, setDiagnosingJobId] = useState<string | null>(null);
  const logsContainerRef = React.useRef<HTMLDivElement>(null);

  // Load all initial inventory & queue
  const fetchData = async () => {
    try {
      const [guRes, ggRes, muRes, mmRes, qRes, jRes] = await Promise.all([
        fetch("/api/google/users?limit=all"),
        fetch("/api/google/groups?limit=all"),
        fetch("/api/microsoft/users?limit=all"),
        fetch("/api/microsoft/mailboxes?limit=all"),
        fetch(`/api/migration/mappings?_t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/migration/jobs?_t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } }),
      ]);

      if (guRes.ok) {
        const d = await guRes.json();
        setGoogleUsers(d.users || []);
      }
      if (ggRes.ok) {
        const d = await ggRes.json();
        setGoogleGroups(d.groups || []);
      }
      if (muRes.ok) {
        const d = await muRes.json();
        setMsUsers(d.users || []);
      }
      if (mmRes.ok) {
        const d = await mmRes.json();
        setMsMailboxes(d.mailboxes || []);
      }
      if (qRes.ok) {
        const d = await qRes.json();
        setQueue(d.mappings || []);
      }
      if (jRes.ok) {
        const d = await jRes.json();
        setJobs(d.jobs || []);
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoadingQueue(false);
      setLoadingJobs(false);
    }
  };

  // Fast jobs polling for live progress & logs with cache busting
  const fetchJobsOnly = async () => {
    try {
      const jRes = await fetch(`/api/migration/jobs?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (jRes.ok) {
        const d = await jRes.json();
        setJobs(d.jobs || []);
      }
    } catch {}
  };

  const fetchLogs = async (jobId: string, showSpinner = true) => {
    if (showSpinner) setLoadingLogs(true);
    try {
      const res = await fetch(`/api/migration/jobs/${jobId}?_t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setLogsData(data);
      }
    } catch (e: any) {
      console.error("Error fetching logs:", e);
    } finally {
      if (showSpinner) setLoadingLogs(false);
    }
  };

  const liveLogsJobRef = React.useRef(liveLogsJob);
  useEffect(() => {
    liveLogsJobRef.current = liveLogsJob;
  }, [liveLogsJob]);

  const hasActiveJobs = useMemo(() => {
    return jobs.some((j) => j.status === "IMPORTING" || j.status === "PREPARING");
  }, [jobs]);

  const hasActiveJobsRef = React.useRef(hasActiveJobs);
  useEffect(() => {
    hasActiveJobsRef.current = hasActiveJobs;
  }, [hasActiveJobs]);

  // Real-time live polling: 1000ms (1s) when active jobs or logs modal open, 2500ms when idle
  useEffect(() => {
    let isMounted = true;
    let isPolling = false;

    const poll = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        await fetchJobsOnly();
        if (liveLogsJobRef.current) {
          await fetchLogs(liveLogsJobRef.current.id, false);
        }
      } catch (err) {
        console.warn("Live poll error:", err);
      } finally {
        isPolling = false;
      }
    };

    let timeoutId: NodeJS.Timeout;
    const scheduleNext = () => {
      const delay = hasActiveJobsRef.current || liveLogsJobRef.current ? 1000 : 2500;
      timeoutId = setTimeout(async () => {
        if (!isMounted) return;
        await poll();
        if (isMounted) scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  // Auto-scroll logs container when new events arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logsData?.events]);

  const handleOpenLogs = (job: any) => {
    setLiveLogsJob(job);
    fetchLogs(job.id, true);
  };

  const handleStartJob = async (job: any) => {
    try {
      showLoading("A Iniciar Migração Direta...", "Conectando ao motor em nuvem...");
      const res = await fetch(`/api/migration/jobs/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Migração Iniciada!", "O motor direto em tempo real está a processar os dados.");
        fetchJobsOnly();
        handleOpenLogs(job);
      } else {
        dialog.error("Erro", data.error || "Falha ao iniciar migração.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message);
    }
  };

  const handlePauseJob = async (job: any) => {
    try {
      showLoading("A Pausar Migração...", "Guardando ponto de retoma seguro...");
      const res = await fetch(`/api/migration/jobs/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.info("Migração Pausada", "Ponto de restauro guardado. Pode continuar quando desejar.");
        fetchJobsOnly();
        if (liveLogsJob?.id === job.id) fetchLogs(job.id, false);
      } else {
        dialog.error("Erro", data.error || "Falha ao pausar migração.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message);
    }
  };

  const handleDiagnoseAndResume = async (job: any) => {
    try {
      setDiagnosingJobId(job.id);
      showLoading("Diagnóstico Inteligente & Recuperação...", "Analisando causas de erro e calculando ponto de retoma...");
      const res = await fetch(`/api/migration/jobs/${job.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "diagnose-and-resume" }),
      });
      const data = await res.json();
      hideLoading();
      setDiagnosingJobId(null);
      if (res.ok && data.result) {
        setDiagnosticResult(data.result);
        fetchJobsOnly();
        handleOpenLogs(job);
      } else {
        dialog.error("Falha na Recuperação", data.error || "Não foi possível recuperar automaticamente.");
      }
    } catch (err: any) {
      setDiagnosingJobId(null);
      hideLoading();
      dialog.error("Erro", err.message);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, []);

  // Close floating dropdown on outside click, resize or Escape
  useEffect(() => {
    const closeMenu = () => {
      setMenuOpenJobId(null);
      setMenuCoords(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Set default emails when direction or scope changes
  useEffect(() => {
    setReadiness(null);
    if (direction === "GOOGLE_TO_MICROSOFT") {
      if (scope === "USERS") {
        if (googleUsers.length > 0 && !sourceEmail) setSourceEmail(googleUsers[0].primaryEmail);
        if (msUsers.length > 0 && !targetEmail) setTargetEmail(msUsers[0].userPrincipalName);
      } else {
        if (googleGroups.length > 0 && !sourceEmail) setSourceEmail(googleGroups[0].email);
        if (msMailboxes.length > 0 && !targetEmail) {
          const shared = msMailboxes.find((m) => m.recipientType === "SHARED_MAILBOX");
          setTargetEmail(shared ? shared.primarySmtpAddress : msMailboxes[0].primarySmtpAddress);
        }
      }
    } else {
      // MICROSOFT_TO_GOOGLE
      if (scope === "USERS") {
        if (msUsers.length > 0 && !sourceEmail) setSourceEmail(msUsers[0].userPrincipalName);
        if (googleUsers.length > 0 && !targetEmail) setTargetEmail(googleUsers[0].primaryEmail);
      } else {
        if (msMailboxes.length > 0 && !sourceEmail) setSourceEmail(msMailboxes[0].primarySmtpAddress);
        if (googleGroups.length > 0 && !targetEmail) setTargetEmail(googleGroups[0].email);
      }
    }
  }, [direction, scope, googleUsers, googleGroups, msUsers, msMailboxes]);

  // Toggle content type selection
  const toggleType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId]
    );
  };

  // Swap direction button
  const handleSwapDirection = () => {
    const newDir: Direction = direction === "GOOGLE_TO_MICROSOFT" ? "MICROSOFT_TO_GOOGLE" : "GOOGLE_TO_MICROSOFT";
    setDirection(newDir);
    const prevSrc = sourceEmail;
    const prevDst = targetEmail;
    setSourceEmail(prevDst);
    setTargetEmail(prevSrc);
    setReadiness(null);
  };

  // Smart auto match
  const handleAutoMatch = () => {
    if (!sourceEmail) return;
    const localPart = sourceEmail.split("@")[0].toLowerCase();

    if (direction === "GOOGLE_TO_MICROSOFT") {
      if (scope === "USERS") {
        const found = msUsers.find((u) => u.userPrincipalName.split("@")[0].toLowerCase() === localPart);
        if (found) {
          setTargetEmail(found.userPrincipalName);
          toast.success("Correspondência Encontrada!", `Destino M365: ${found.userPrincipalName}`);
          return;
        }
      } else {
        const found = msMailboxes.find((m) => m.primarySmtpAddress.split("@")[0].toLowerCase() === localPart);
        if (found) {
          setTargetEmail(found.primarySmtpAddress);
          toast.success("Correspondência Encontrada!", `Destino M365: ${found.primarySmtpAddress}`);
          return;
        }
      }
    } else {
      if (scope === "USERS") {
        const found = googleUsers.find((u) => u.primaryEmail.split("@")[0].toLowerCase() === localPart);
        if (found) {
          setTargetEmail(found.primaryEmail);
          toast.success("Correspondência Encontrada!", `Destino Google: ${found.primaryEmail}`);
          return;
        }
      } else {
        const found = googleGroups.find((g) => g.email.split("@")[0].toLowerCase() === localPart);
        if (found) {
          setTargetEmail(found.email);
          toast.success("Correspondência Encontrada!", `Destino Google: ${found.email}`);
          return;
        }
      }
    }
    toast.info("Sem correspondência exata", "Selecione manualmente a conta de destino no seletor.");
  };

  // Validate readiness (never blocked by local backup)
  const handleValidate = async () => {
    if (!sourceEmail || !targetEmail) {
      toast.warning("Campos Obrigatórios", "Selecione a conta de origem e a conta de destino.");
      return;
    }
    setLoadingReadiness(true);
    setReadiness(null);
    showLoading(
      "A Validar Pré-Requisitos...",
      `A verificar ${direction === "GOOGLE_TO_MICROSOFT" ? "Google ➔ Microsoft" : "Microsoft ➔ Google"}...`
    );
    try {
      const res = await fetch(
        `/api/migration/readiness?direction=${direction}&scope=${scope}&sourceEmail=${encodeURIComponent(
          sourceEmail
        )}&targetEmail=${encodeURIComponent(targetEmail)}`
      );
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        setReadiness(data);
        if (data.isReady) {
          toast.success("Validação Concluída!", "Pronto para migração direta Cloud-to-Cloud.");
        } else {
          toast.warning("Avisos Identificados", "Consulte o relatório de prontidão.");
        }
      } else {
        dialog.error("Erro na Validação", data.error || "Falha na verificação de conformidade.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado de ligação.");
    } finally {
      setLoadingReadiness(false);
    }
  };

  // Run deep analysis and open modal
  const handleAnalyzePair = async (src = sourceEmail, dst = targetEmail, dir = direction, sc = scope) => {
    if (!src || !dst) return;
    setAnalyzingPair(true);
    showLoading("A Analisar & Comparar Dados...", "A calcular duplicados, quotas, limites de tamanho e estrutura...");
    try {
      const res = await fetch("/api/migration/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEmail: src,
          targetEmail: dst,
          direction: dir,
          scope: sc,
          selectedTypes,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        setAnalysisModalData(data.analysis);
      } else {
        dialog.error("Erro na Análise", data.error || "Não foi possível analisar o par.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setAnalyzingPair(false);
    }
  };

  // Add pair to staging queue
  const handleAddToQueue = async () => {
    if (!sourceEmail || !targetEmail) {
      toast.warning("Campos Obrigatórios", "Selecione as contas de origem e destino.");
      return;
    }
    setActionLoading(true);
    showLoading("A Adicionar à Fila...", "A registar par de contas e a analisar compatibilidade...");
    try {
      const res = await fetch("/api/migration/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEmail,
          targetEmail,
          direction,
          scope,
          selectedTypes,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Conta Adicionada à Fila!", "Pode adicionar mais contas ou ativar a migração quando desejar.");
        fetchData();
        setReadiness(null);
      } else {
        dialog.error("Erro", data.error || "Não foi possível adicionar à fila.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  // Remove from queue
  const handleRemoveFromQueue = async (id: string) => {
    try {
      const res = await fetch(`/api/migration/mappings?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Removido da Fila", "A conta foi removida com sucesso.");
        fetchData();
      }
    } catch (err: any) {
      dialog.error("Erro", err.message);
    }
  };

  // Execute single account migration (individual activation)
  const handleExecuteSingle = async (mapping: any) => {
    const confirmed = await confirmAction({
      title: "Iniciar Migração Desta Conta?",
      text: `Origem: ${mapping.sourceGroupEmail}\nDestino: ${mapping.targetEmail}\nDireção: ${
        mapping.direction === "GOOGLE_TO_MICROSOFT" ? "Google ➔ M365" : "M365 ➔ Google"
      }\n\nDeseja ativar a migração agora?`,
      confirmText: "Sim, Iniciar Migração",
      icon: "question",
    });

    if (!confirmed) return;

    showLoading("A Iniciar Migração...", `A processar transferência para ${mapping.targetEmail}...`);
    try {
      const res = await fetch("/api/migration/mappings/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mapping.id }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        setQueue((prev) => prev.filter((m) => m.id !== mapping.id));
        dialog.success(
          "Migração Iniciada com Sucesso!",
          `O trabalho foi criado e está a ser executado. Acompanhe na tabela de trabalhos abaixo.`
        );
        fetchData();
      } else {
        dialog.error("Erro ao Iniciar", data.error || "Falha na execução.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Execute Batch Migration (all pending items in queue)
  const handleExecuteBatch = async () => {
    const pendingItems = queue.filter((q) => q.status === "PENDING");
    if (pendingItems.length === 0) {
      toast.info("Fila Vazia", "Não existem contas pendentes na fila de migração.");
      return;
    }

    const confirmed = await confirmAction({
      title: `Iniciar Migração em Lote (${pendingItems.length} Contas)?`,
      text: `Serão processadas ${pendingItems.length} contas em lote com deduplicação e transferência direta Cloud-to-Cloud.\n\nDeseja avançar?`,
      confirmText: `Sim, Migrar ${pendingItems.length} Contas`,
      icon: "question",
    });

    if (!confirmed) return;

    showLoading(
      "A Executar Migração em Lote...",
      `A processar lote de ${pendingItems.length} contas em paralelo...`
    );
    try {
      const res = await fetch("/api/migration/mappings/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        setQueue((prev) => prev.filter((m) => !pendingItems.some((p) => p.id === m.id)));
        dialog.success(
          "Lote de Migração Disparado com Sucesso!",
          `Foram criados ${data.successCount} trabalhos de migração a partir da fila.`
        );
        fetchData();
      } else {
        dialog.error("Erro na Execução em Lote", data.error || "Falha ao processar lote.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Direct immediate migration (single without queue)
  const handleImmediateMigration = async () => {
    if (!sourceEmail || !targetEmail) return;
    const directionLabel =
      direction === "GOOGLE_TO_MICROSOFT" ? "Google ➔ Microsoft 365" : "Microsoft ➔ Google Workspace";

    const confirmed = await confirmAction({
      title: "Iniciar Migração Imediata?",
      text: `Origem: ${sourceEmail}\nDestino: ${targetEmail}\nDireção: ${directionLabel}\n\nDeseja iniciar a migração de imediato?`,
      confirmText: "Sim, Iniciar Agora",
      icon: "question",
    });

    if (!confirmed) return;

    setActionLoading(true);
    showLoading("A Criar e Iniciar Trabalho...", "A preparar manifesto e leitura Cloud-to-Cloud...");
    try {
      const res = await fetch("/api/migration/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          scope,
          sourceEmail,
          targetEmail,
          selectedTypes,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        dialog.success(
          "Migração Iniciada com Sucesso!",
          `O trabalho foi registado e está em execução no sentido ${directionLabel}.`
        );
        fetchData();
        setReadiness(null);
      } else {
        dialog.error("Erro ao Iniciar", data.error || "Falha na criação do trabalho.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger Purview import adapter
  const handleTriggerImport = async (jobId: string) => {
    try {
      showLoading("A Iniciar Importação...", "A contactar adaptador de importação...");
      const res = await fetch(`/api/migration/jobs/${jobId}/import`, {
        method: "POST",
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Importação Disparada!", "O processo de importação avançou.");
        fetchData();
      } else {
        dialog.error("Erro", data.error || "Falha ao iniciar importação.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message);
    }
  };

  // Save Purview Job ID
  const handleSavePurviewJobId = async () => {
    if (!activeJobForPurview) return;
    try {
      showLoading("A Guardar...", "A registar Purview Job ID...");
      const res = await fetch(`/api/migration/jobs/${activeJobForPurview.id}/import`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purviewJobId: purviewJobIdInput,
          status: "IN_PROGRESS",
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Guardado!", "Purview Job ID registado com sucesso.");
        setActiveJobForPurview(null);
        setPurviewJobIdInput("");
        fetchData();
      } else {
        dialog.error("Erro", data.error || "Falha ao gravar Job ID.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message);
    }
  };

  // Toggle dropdown menu positioned relative to viewport with auto-flip and exact button anchoring
  const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, jobId: string) => {
    e.stopPropagation();
    if (menuOpenJobId === jobId) {
      setMenuOpenJobId(null);
      setMenuCoords(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 224; // w-56
    const menuHeight = 240;

    // Detect available space: flip UPWARDS if near bottom of viewport
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldOpenUpwards = spaceBelow < menuHeight;

    let top = shouldOpenUpwards ? rect.top - menuHeight - 6 : rect.bottom + 6;
    if (top < 10) top = 10;
    if (top + menuHeight > window.innerHeight) {
      top = Math.max(10, window.innerHeight - menuHeight - 10);
    }

    // Anchor right edge of menu flush with right edge of button
    let left = rect.right - menuWidth;
    if (left < 10) left = 10;
    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }

    setMenuOpenJobId(jobId);
    setMenuCoords({ top, left: Math.round(left) });
  };

  // Restart migration job
  const handleRestartJob = async (job: any) => {
    setMenuOpenJobId(null);
    const confirmed = await confirmAction({
      title: "Reiniciar Migração?",
      text: `Trabalho: ${job.sourceGroupEmail} ➔ ${job.targetMailboxEmail}\n\nO processo será re-analisado e os manifestos serão gerados novamente.\nDeseja reiniciar agora?`,
      confirmText: "Sim, Reiniciar",
      icon: "question",
    });
    if (!confirmed) return;

    showLoading("A Reiniciar...", "A reprocessar análise e manifestos de migração...");
    try {
      const res = await fetch(`/api/migration/jobs/${job.id}/restart`, { method: "POST" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        dialog.success("Trabalho Reiniciado!", "O manifesto foi regerado e o estado atualizado para READY_TO_IMPORT.");
        fetchData();
      } else {
        dialog.error("Erro ao Reiniciar", data.error || "Falha ao reiniciar trabalho.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Delete migration job
  const handleDeleteJob = async (job: any) => {
    setMenuOpenJobId(null);
    const confirmed = await confirmAction({
      title: "Eliminar Trabalho de Migração?",
      text: `Trabalho: ${job.sourceGroupEmail} ➔ ${job.targetMailboxEmail}\n\nTem a certeza de que deseja eliminar este trabalho de migração? Esta ação é irreversível.`,
      confirmText: "Sim, Eliminar",
      icon: "warning",
    });
    if (!confirmed) return;

    showLoading("A Eliminar...", "A remover trabalho de migração...");
    try {
      const res = await fetch(`/api/migration/jobs/${job.id}`, { method: "DELETE" });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Eliminado", "Trabalho de migração removido com sucesso.");
        fetchData();
      } else {
        dialog.error("Erro", data.error || "Não foi possível eliminar o trabalho.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Open edit modal
  const handleOpenEditModal = (job: any) => {
    setMenuOpenJobId(null);
    setEditingJob(job);
    setEditTargetEmail(job.targetMailboxEmail || "");
    setEditStatus(job.status || "PREPARING");
    setEditPurviewJobId(job.purviewJobId || "");
    setEditSelectedTypes(
      job.selectedTypes ? job.selectedTypes.split(",") : ["EMAILS", "CALENDARS", "CONTACTS", "RULES", "TAGS"]
    );
  };

  // Save edit modal
  const handleSaveEditJob = async () => {
    if (!editingJob) return;
    showLoading("A Guardar...", "A atualizar configurações do trabalho...");
    try {
      const res = await fetch(`/api/migration/jobs/${editingJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMailboxEmail: editTargetEmail,
          status: editStatus,
          purviewJobId: editPurviewJobId,
          selectedTypes: editSelectedTypes,
        }),
      });
      const data = await res.json();
      hideLoading();
      if (res.ok) {
        toast.success("Atualizado!", "Trabalho de migração editado com sucesso.");
        setEditingJob(null);
        fetchData();
      } else {
        dialog.error("Erro", data.error || "Falha ao atualizar trabalho.");
      }
    } catch (err: any) {
      hideLoading();
      dialog.error("Falha", err.message || "Erro inesperado.");
    }
  };

  // Filtered jobs list
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const matchDir = directionFilter === "ALL" || (j.direction || "GOOGLE_TO_MICROSOFT") === directionFilter;
      const matchStatus = statusFilter === "ALL" || j.status === statusFilter;
      const matchSearch =
        !jobsSearch.trim() ||
        (j.sourceGroupEmail || "").toLowerCase().includes(jobsSearch.toLowerCase()) ||
        (j.targetMailboxEmail || "").toLowerCase().includes(jobsSearch.toLowerCase());
      return matchDir && matchStatus && matchSearch;
    });
  }, [jobs, directionFilter, statusFilter, jobsSearch]);

  const pendingQueueCount = queue.filter((q) => q.status === "PENDING").length;

  return (
    <div className="space-y-8 font-body">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[#223546] dark:text-slate-100 flex items-center gap-2.5 font-heading">
          <ArrowRightLeft className="w-6 h-6 text-[#e95c0c]" />
          Hub de Migração Bidirecional & Fila em Lote (Google ⇄ Microsoft)
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
          Migração Direta Cloud-to-Cloud via APIs, planeamento conta a conta ou em lote, análise de duplicados e seleção granular de conteúdos.
        </p>
      </div>

      {/* =================================================================== */}
      {/* 1. SELEÇÃO DE DIREÇÃO E ESCOPO                                      */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-[#223546] dark:text-slate-100 uppercase tracking-wider font-heading flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#e95c0c]" />
              1. Sentido da Migração & Tipo de Objeto
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Escolha a direção de transferência e o tipo de contas a migrar.
            </p>
          </div>

          {/* Scope Selector: Users vs Groups */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-[#101720] rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setScope("USERS");
                setSelectedTypes(["EMAILS", "CALENDARS", "CONTACTS", "RULES", "TAGS"]);
              }}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                scope === "USERS"
                  ? "bg-white dark:bg-[#1c2836] text-[#223546] dark:text-white shadow-xs font-black"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Contas de Utilizadores</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setScope("GROUPS");
                setSelectedTypes(["EMAILS", "RULES", "TAGS"]);
              }}
              className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                scope === "GROUPS"
                  ? "bg-white dark:bg-[#1c2836] text-[#223546] dark:text-white shadow-xs font-black"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Grupos / Caixas Partilhadas</span>
            </button>
          </div>
        </div>

        {/* Direction Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option A: Google -> Microsoft */}
          <div
            onClick={() => {
              setDirection("GOOGLE_TO_MICROSOFT");
              setReadiness(null);
            }}
            className={`p-5 rounded-2xl border-2 cursor-pointer transition relative overflow-hidden ${
              direction === "GOOGLE_TO_MICROSOFT"
                ? "bg-sky-50/60 dark:bg-sky-950/30 border-[#e95c0c] shadow-md ring-2 ring-[#e95c0c]/10"
                : "bg-white dark:bg-[#121921] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-75 hover:opacity-100"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 dark:bg-orange-950/60 text-[#e95c0c] border border-orange-200 dark:border-orange-900/60 font-heading">
                Sentido A
              </span>
              {direction === "GOOGLE_TO_MICROSOFT" && (
                <CheckCircle2 className="w-5 h-5 text-[#e95c0c]" />
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-[#e95c0c] flex items-center justify-center font-black">
                G
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400" />
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 flex items-center justify-center font-black">
                M
              </div>
            </div>

            <h3 className="text-base font-black text-[#223546] dark:text-slate-100 mt-3 font-heading">
              Google Workspace ➔ Microsoft 365
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Migração direta via APIs ou pacote Purview para caixas e utilizadores do Exchange / Microsoft 365.
            </p>
          </div>

          {/* Option B: Microsoft -> Google */}
          <div
            onClick={() => {
              setDirection("MICROSOFT_TO_GOOGLE");
              setReadiness(null);
            }}
            className={`p-5 rounded-2xl border-2 cursor-pointer transition relative overflow-hidden ${
              direction === "MICROSOFT_TO_GOOGLE"
                ? "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-500 shadow-md ring-2 ring-emerald-500/10"
                : "bg-white dark:bg-[#121921] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 opacity-75 hover:opacity-100"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 font-heading">
                Sentido B
              </span>
              {direction === "MICROSOFT_TO_GOOGLE" && (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 flex items-center justify-center font-black">
                M
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400" />
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-black">
                G
              </div>
            </div>

            <h3 className="text-base font-black text-[#223546] dark:text-slate-100 mt-3 font-heading">
              Microsoft 365 ➔ Google Workspace
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Migração direta via Graph API para contas de utilizadores ou grupos no Google Workspace.
            </p>
          </div>
        </div>

        {/* Quick swap button */}
        <div className="flex justify-center -mt-2">
          <button
            type="button"
            onClick={handleSwapDirection}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#1c2836] hover:bg-slate-200 dark:hover:bg-[#253648] text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-2xs transition cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#e95c0c]" />
            <span>Inverter Sentido (Origem ⇄ Destino)</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. SELEÇÃO DE CONTAS & ESCOPO DE CONTEÚDO                           */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-[#223546] dark:text-slate-100 uppercase tracking-wider font-heading flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#e95c0c]" />
              2. Selecionar Contas e Conteúdos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Defina as contas e marque exatamente o que quer migrar (e-mails, calendários, contactos, regras, tags).
            </p>
          </div>

          <button
            type="button"
            onClick={handleAutoMatch}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#e95c0c]/10 hover:bg-[#e95c0c]/20 text-[#e95c0c] border border-[#e95c0c]/30 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mapeamento Automático (Mesmo Nome / Alias)</span>
          </button>
        </div>

        {/* Account Pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* SOURCE ACCOUNT COLUMN */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#101720] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#e95c0c]" />
                Origem ({direction === "GOOGLE_TO_MICROSOFT" ? "Google" : "Microsoft"}):
              </label>
              <button
                type="button"
                onClick={() => setCustomSourceInput(!customSourceInput)}
                className="text-[11px] text-sky-600 hover:underline font-semibold"
              >
                {customSourceInput ? "Escolher da Lista" : "Digitar E-mail Manual"}
              </button>
            </div>

            {customSourceInput ? (
              <input
                type="email"
                placeholder="origem@dominio.com"
                value={sourceEmail}
                onChange={(e) => {
                  setSourceEmail(e.target.value);
                  setReadiness(null);
                }}
                className="w-full p-2.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#e95c0c]"
              />
            ) : (
              <SearchableAccountSelect
                options={sourceOptions}
                value={sourceEmail}
                onChange={(val) => {
                  setSourceEmail(val);
                  setReadiness(null);
                }}
                placeholder={sourcePlaceholder}
                searchPlaceholder="Pesquisar conta por nome ou e-mail..."
              />
            )}

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              E-mail de origem: <strong className="text-slate-800 dark:text-slate-200 font-mono">{sourceEmail || "Nenhum"}</strong>
            </div>
          </div>

          {/* TARGET ACCOUNT COLUMN */}
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#101720] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                Destino ({direction === "GOOGLE_TO_MICROSOFT" ? "Microsoft" : "Google"}):
              </label>
              <button
                type="button"
                onClick={() => setCustomTargetInput(!customTargetInput)}
                className="text-[11px] text-sky-600 hover:underline font-semibold"
              >
                {customTargetInput ? "Escolher da Lista" : "Digitar E-mail Manual"}
              </button>
            </div>

            {customTargetInput ? (
              <input
                type="email"
                placeholder="destino@dominio.com"
                value={targetEmail}
                onChange={(e) => {
                  setTargetEmail(e.target.value);
                  setReadiness(null);
                }}
                className="w-full p-2.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#e95c0c]"
              />
            ) : (
              <SearchableAccountSelect
                options={targetOptions}
                value={targetEmail}
                onChange={(val) => {
                  setTargetEmail(val);
                  setReadiness(null);
                }}
                placeholder={targetPlaceholder}
                searchPlaceholder="Pesquisar conta por nome ou e-mail..."
              />
            )}

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              E-mail de destino: <strong className="text-slate-800 dark:text-slate-200 font-mono">{targetEmail || "Nenhum"}</strong>
            </div>
          </div>
        </div>

        {/* Content Types Checkboxes */}
        <div className="space-y-3 pt-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Conteúdos a Migrar (Seleção Granular):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {AVAILABLE_TYPES.filter((t) => (scope === "GROUPS" ? !["CALENDARS", "CONTACTS"].includes(t.id) : true)).map((t) => {
              const active = selectedTypes.includes(t.id);
              const Icon = t.icon;
              return (
                <div
                  key={t.id}
                  onClick={() => toggleType(t.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${
                    active
                      ? "bg-[#e95c0c]/5 dark:bg-[#e95c0c]/10 border-[#e95c0c] text-[#e95c0c]"
                      : "bg-slate-50 dark:bg-[#101720] border-slate-200 dark:border-slate-800 text-slate-500 opacity-60 hover:opacity-100"
                  }`}
                >
                  <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 ${
                    active ? "bg-[#e95c0c] text-white" : "border border-slate-300 dark:border-slate-600"
                  }`}>
                    {active && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {t.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons: Validate, Analyze, Add to Queue, Migrate Now */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={handleValidate}
            disabled={loadingReadiness || !sourceEmail || !targetEmail}
            className="px-4 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{loadingReadiness ? "A Validar..." : "Validar Prontidão"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleAnalyzePair()}
            disabled={analyzingPair || !sourceEmail || !targetEmail}
            className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-xs"
          >
            <Eye className="w-4 h-4" />
            <span>{analyzingPair ? "A Analisar..." : "Analisar & Comparar Dados"}</span>
          </button>

          <button
            type="button"
            onClick={handleAddToQueue}
            disabled={actionLoading || !sourceEmail || !targetEmail}
            className="px-4 py-2.5 bg-[#e95c0c] hover:bg-[#d04f08] active:bg-[#b34500] text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-md shadow-orange-600/20"
          >
            <span>➕ Adicionar à Fila de Migração</span>
          </button>

          <button
            type="button"
            onClick={handleImmediateMigration}
            disabled={actionLoading || !sourceEmail || !targetEmail}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-md shadow-emerald-600/20"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Migrar Agora Imediatamente</span>
          </button>
        </div>

        {/* Readiness Checklist Card */}
        {readiness && (
          <div className="p-4 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs text-[#223546] dark:text-slate-200 uppercase tracking-wider font-heading">
                Relatório de Prontidão da Migração ({direction === "GOOGLE_TO_MICROSOFT" ? "Google ➔ M365" : "M365 ➔ Google"})
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                APROVADO PARA MIGRAÇÃO CLOUD-TO-CLOUD
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {readiness.checks.map((c: any) => (
                <div key={c.key} className="flex items-start gap-2.5">
                  {c.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{c.label}:</span>{" "}
                    <span className="text-slate-600 dark:text-slate-400">{c.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 3. FILA DE MIGRAÇÃO & EXECUÇÃO EM LOTE                              */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-[#223546] dark:text-slate-100 flex items-center gap-2 font-heading">
              <Layers className="w-5 h-5 text-[#e95c0c]" />
              Fila de Planeamento & Migração em Lote ({queue.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Adicione contas uma a uma e ative a migração individualmente ou processe todas em lote.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExecuteBatch}
              disabled={pendingQueueCount === 0}
              className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] active:bg-[#b34500] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 shadow-sm"
            >
              <PlayCircle className="w-4 h-4" />
              <span>▶️ Executar Migração em Lote ({pendingQueueCount} Pendentes)</span>
            </button>
            <button
              onClick={fetchData}
              title="Recarregar Fila"
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#101720] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                <th className="py-3 px-4 font-heading">Sentido</th>
                <th className="py-3 px-4 font-heading">Conta Origem</th>
                <th className="py-3 px-4 font-heading">Conta Destino</th>
                <th className="py-3 px-4 font-heading">Conteúdos</th>
                <th className="py-3 px-4 text-center font-heading">Estado</th>
                <th className="py-3 px-4 text-right font-heading">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loadingQueue ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    A carregar fila de migração...
                  </td>
                </tr>
              ) : queue.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    A fila de migração está vazia. Adicione contas acima usando o botão &quot;Adicionar à Fila de Migração&quot;.
                  </td>
                </tr>
              ) : (
                queue.map((m) => {
                  const isG2M = (m.direction || "GOOGLE_TO_MICROSOFT") === "GOOGLE_TO_MICROSOFT";
                  const types = (m.selectedTypes || "").split(",").filter(Boolean);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        {isG2M ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 dark:bg-orange-950/40 text-[#e95c0c] border border-orange-200 dark:border-orange-800/60">
                            Google ➔ M365
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                            M365 ➔ Google
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {m.sourceGroupEmail}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {m.targetEmail}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {types.map((t: string) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.status === "COMPLETED"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : m.status === "FAILED"
                              ? "bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800"
                              : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          {m.status === "PENDING" ? "Pronto na Fila" : m.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => handleAnalyzePair(m.sourceGroupEmail, m.targetEmail, m.direction, m.scope)}
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded text-xs font-bold transition cursor-pointer"
                        >
                          Analisar
                        </button>
                        {m.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => handleExecuteSingle(m)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition cursor-pointer inline-flex items-center gap-1"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Migrar Esta Conta</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFromQueue(m.id)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 rounded transition cursor-pointer"
                          title="Remover da Fila"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 4. TRABALHOS DE MIGRAÇÃO REGISTADOS (HISTÓRICO)                     */}
      {/* =================================================================== */}
      <div className="bg-white dark:bg-[#15202c] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-[#223546] dark:text-slate-100 flex items-center gap-2 font-heading">
              <Clock className="w-5 h-5 text-[#e95c0c]" />
              Trabalhos de Migração Registados ({filteredJobs.length})
              {hasActiveJobs && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Tempo Real Ativo
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Histórico de migrações bidirecionais preparadas e executadas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">Todas as Direções</option>
              <option value="GOOGLE_TO_MICROSOFT">Google ➔ Microsoft</option>
              <option value="MICROSOFT_TO_GOOGLE">Microsoft ➔ Google</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">Todos os Estados</option>
              <option value="COMPLETED">Concluído</option>
              <option value="READY_TO_IMPORT">Pronto a Importar</option>
              <option value="AWAITING_PURVIEW_JOB">Aguardando Purview</option>
              <option value="IMPORTING">A Importar</option>
              <option value="PREPARING">A Preparar</option>
            </select>

            <button
              onClick={fetchData}
              title="Recarregar"
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#101720] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                <th className="py-3 px-4 font-heading">Sentido</th>
                <th className="py-3 px-4 font-heading">Conta Origem</th>
                <th className="py-3 px-4 font-heading">Conta Destino</th>
                <th className="py-3 px-4 text-center font-heading">Estado</th>
                <th className="py-3 px-4 font-heading min-w-[140px]">Progresso & Itens</th>
                <th className="py-3 px-4 text-center font-heading">Manifesto / CSV</th>
                <th className="py-3 px-4 font-heading">Ref / Purview ID</th>
                <th className="py-3 px-4 text-right font-heading">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loadingJobs ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    A carregar trabalhos de migração...
                  </td>
                </tr>
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhum trabalho de migração registado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((j) => {
                  const isG2M = (j.direction || "GOOGLE_TO_MICROSOFT") === "GOOGLE_TO_MICROSOFT";
                  return (
                    <tr key={j.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        {isG2M ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 dark:bg-orange-950/40 text-[#e95c0c] border border-orange-200 dark:border-orange-800/60">
                            Google ➔ M365
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                            M365 ➔ Google
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {j.sourceGroupEmail}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                        {j.targetMailboxEmail}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase ${
                            j.status === "COMPLETED"
                              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : j.status === "IMPORTING"
                              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 animate-pulse"
                              : j.status === "FAILED"
                              ? "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                              : j.status === "PAUSED"
                              ? "bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700"
                              : j.status === "AWAITING_PURVIEW_JOB"
                              ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                              : j.status === "READY_TO_IMPORT"
                              ? "bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {j.status === "IMPORTING" && <Activity className="w-3 h-3 animate-spin" />}
                          {j.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3" />}
                          {j.status === "FAILED" && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                          {j.status}
                        </span>
                      </td>

                      {/* Progresso & Itens em Tempo Real */}
                      <td className="py-3 px-4">
                        {(() => {
                          const total = j.totalItems || j.validItems || 0;
                          const imported = j.importedItems || 0;
                          const duplicates = j.duplicateItems || 0;
                          const isCompleted = j.status === "COMPLETED";
                          const processed = isCompleted ? total : Math.min(total, imported + duplicates);
                          const pct = isCompleted ? 100 : Math.min(100, Math.round((processed / (total || 1)) * 100));
                          const displayCurrent = isCompleted ? total : imported;
                          return (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-700 dark:text-slate-200">
                                  {displayCurrent} / {total}
                                </span>
                                <span className={`font-black ${pct === 100 ? "text-emerald-600" : "text-[#e95c0c]"}`}>
                                  {pct}%
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 rounded-full ${
                                    pct === 100
                                      ? "bg-emerald-500"
                                      : j.status === "FAILED"
                                      ? "bg-rose-500"
                                      : "bg-[#e95c0c]"
                                  }`}
                                  style={{ width: `${Math.max(4, pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-3 px-4 text-center">
                        {j.purviewMappingCsvPath ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Gerado
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {j.purviewJobId || <span className="text-slate-400">Não informado</span>}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end">
                          {/* Menu de Ações (Dropdown) */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleMenu(e, j.id)}
                            title="Mais Opções"
                            className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                              menuOpenJobId === j.id
                                ? "bg-[#e95c0c]/10 border-[#e95c0c]/40 text-[#e95c0c] shadow-2xs"
                                : "bg-white dark:bg-[#101720] border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 shadow-2xs"
                            }`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 5. MODAL DE ANÁLISE PRÉVIA & COMPARAÇÃO DE DADOS                    */}
      {/* =================================================================== */}
      {analysisModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2533] rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-2xl w-full p-6 space-y-6 text-slate-800 dark:text-white max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#e95c0c]/10 text-[#e95c0c] border border-[#e95c0c]/20 font-heading">
                  Inspeção Prévia & Comparação de Dados
                </span>
                <h3 className="text-base font-black text-[#223546] dark:text-white mt-1 font-heading">
                  {analysisModalData.sourceAccount} ➔ {analysisModalData.targetAccount}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAnalysisModalData(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Score & Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-[#121921] rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Compatibilidade</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-heading">
                  {analysisModalData.compatibilityScore}%
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#121921] rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Itens Estimados</div>
                <div className="text-xl font-black text-[#223546] dark:text-white mt-0.5 font-heading">
                  {analysisModalData.estimatedItems.emails +
                    analysisModalData.estimatedItems.calendars +
                    analysisModalData.estimatedItems.contacts}
                </div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-medium">
                  {analysisModalData.scope === "GROUPS"
                    ? `${analysisModalData.estimatedItems.emails} e-mails`
                    : `${analysisModalData.estimatedItems.emails} msgs • ${analysisModalData.estimatedItems.calendars} cal • ${analysisModalData.estimatedItems.contacts} cont`}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#121921] rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Duplicados Detetados</div>
                <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5 font-heading">
                  {analysisModalData.duplicatesDetected}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-[#121921] rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Itens &gt; 25MB</div>
                <div className="text-xl font-black text-sky-600 dark:text-sky-400 mt-0.5 font-heading">
                  {analysisModalData.oversizedItemsCount}
                </div>
              </div>
            </div>

            {/* Incompatibilities & Automatic Treatment */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-heading">
                Deteção de Incompatibilidades & Tratamento Automático:
              </h4>
              <div className="space-y-2">
                {analysisModalData.incompatibilities.map((inc: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs space-y-1"
                  >
                    <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{inc.description}</span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400 text-[11px] pl-5">
                      <strong>Resolução do Sistema:</strong> {inc.remediation}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Structure Mapping (Labels ⇄ Folders) */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 font-heading">
                Mapeamento Fiel de Estrutura (Origem ➔ Destino):
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#121921] text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 px-3">Origem ({analysisModalData.direction === "GOOGLE_TO_MICROSOFT" ? "Google" : "Microsoft"})</th>
                      <th className="py-2 px-3">Destino ({analysisModalData.direction === "GOOGLE_TO_MICROSOFT" ? "Microsoft" : "Google"})</th>
                      <th className="py-2 px-3">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {analysisModalData.structureMapping.map((st: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono text-slate-800 dark:text-slate-200">{st.sourceStructure}</td>
                        <td className="py-2 px-3 font-mono text-[#e95c0c]">{st.targetStructure}</td>
                        <td className="py-2 px-3 text-slate-500 text-[10px]">{st.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAnalysisModalData(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
              >
                Fechar Análise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* MODAL: REGISTAR PURVIEW JOB ID                                      */}
      {/* ------------------------------------------------------------------- */}
      {activeJobForPurview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 dark:bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#1c2836] rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xl max-w-md w-full p-6 space-y-4 text-slate-800 dark:text-white">
            <h3 className="font-black text-sm text-[#223546] dark:text-white uppercase tracking-wider font-heading">
              Registar Microsoft Purview Import Job ID
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Após criar o Import Job no portal Microsoft Purview com o ficheiro de mapeamento CSV gerado, insira o ID atribuído para rastreabilidade:
            </p>

            <input
              type="text"
              placeholder="Ex: Purview-Import-Informatica-20261002"
              value={purviewJobIdInput}
              onChange={(e) => setPurviewJobIdInput(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-[#101720] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#e95c0c]"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setActiveJobForPurview(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePurviewJobId}
                className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white font-bold rounded-lg text-xs"
              >
                Guardar ID
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* DROPDOWN FLUTUANTE DE AÇÕES (PORTAL DIRETO NO BODY - 100% VISÍVEL) */}
      {/* =================================================================== */}
      {mounted && menuOpenJobId && menuCoords && (() => {
        const j = jobs.find((item) => item.id === menuOpenJobId);
        if (!j) return null;
        const isG2M = (j.direction || "GOOGLE_TO_MICROSOFT") === "GOOGLE_TO_MICROSOFT";
        return createPortal(
          <div
            style={{
              position: "fixed",
              top: `${menuCoords.top}px`,
              left: `${menuCoords.left}px`,
              width: "224px",
              zIndex: 999999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1a2533] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl py-1.5 font-body text-xs text-slate-700 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-100 select-none ring-1 ring-black/5 divide-y divide-slate-100 dark:divide-slate-800/80"
          >
            <div className="px-3.5 py-2">
              <p className="text-[10px] uppercase font-black text-slate-400 font-heading tracking-wider">
                Ações do Trabalho
              </p>
              <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate max-w-[200px] mt-0.5">
                {j.sourceGroupEmail}
              </p>
            </div>

            <div className="py-1">
              {/* 0. Ver Logs em Tempo Real */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpenJobId(null);
                  handleOpenLogs(j);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#223546] flex items-center gap-2.5 transition cursor-pointer text-slate-800 dark:text-slate-200 font-bold"
              >
                <Terminal className="w-4 h-4 text-[#e95c0c]" />
                <span>Ver Logs em Tempo Real</span>
              </button>

              {/* 0.1 Analisar Erro & Retomar */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpenJobId(null);
                  handleDiagnoseAndResume(j);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-[#e95c0c]/10 flex items-center gap-2.5 transition cursor-pointer text-[#e95c0c] font-bold"
              >
                <Wrench className="w-4 h-4" />
                <span>Analisar Erro & Retomar</span>
              </button>

              {/* Iniciar / Pausar Migração Direta */}
              {j.status === "IMPORTING" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenJobId(null);
                    handlePauseJob(j);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-amber-50 dark:hover:bg-[#223546] flex items-center gap-2.5 transition cursor-pointer text-amber-600 font-bold"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pausar Migração</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenJobId(null);
                    handleStartJob(j);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-emerald-50 dark:hover:bg-[#223546] flex items-center gap-2.5 transition cursor-pointer text-emerald-600 font-bold"
                >
                  <Play className="w-4 h-4" />
                  <span>Iniciar Migração Direta</span>
                </button>
              )}

              {/* 1. Reiniciar */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpenJobId(null);
                  handleRestartJob(j);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#223546] flex items-center gap-2.5 transition cursor-pointer text-slate-800 dark:text-slate-200 font-semibold"
              >
                <RotateCcw className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Reiniciar Migração</span>
              </button>

              {/* 2. Editar */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpenJobId(null);
                  handleOpenEditModal(j);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#223546] flex items-center gap-2.5 transition cursor-pointer text-slate-800 dark:text-slate-200 font-semibold"
              >
                <Pencil className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Editar Trabalho</span>
              </button>

              {/* 3. Ver Análise */}
              <button
                type="button"
                onClick={() => {
                  setMenuOpenJobId(null);
                  if (j.analysisResult && Object.keys(j.analysisResult).length > 0) {
                    setAnalysisModalData(j.analysisResult);
                  } else {
                    handleAnalyzePair(j.sourceGroupEmail, j.targetMailboxEmail, j.direction, j.scope);
                  }
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-[#223546] flex items-center gap-2.5 transition cursor-pointer text-slate-800 dark:text-slate-200 font-semibold"
              >
                <Eye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Ver Análise & Estrutura</span>
              </button>

              {/* Contextual: Avançar Purview */}
              {j.status === "READY_TO_IMPORT" && isG2M && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenJobId(null);
                    handleTriggerImport(j.id);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-amber-50 dark:hover:bg-amber-950/40 flex items-center gap-2.5 transition cursor-pointer text-amber-600 dark:text-amber-400 font-bold"
                >
                  <Play className="w-4 h-4" />
                  <span>Avançar Purview Import</span>
                </button>
              )}

              {/* Contextual: Registar Purview Job ID */}
              {j.status === "AWAITING_PURVIEW_JOB" && isG2M && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenJobId(null);
                    setActiveJobForPurview(j);
                    setPurviewJobIdInput(j.purviewJobId || "");
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-2.5 transition cursor-pointer text-blue-600 dark:text-blue-400 font-bold"
                >
                  <Sliders className="w-4 h-4" />
                  <span>Registar Purview Job ID</span>
                </button>
              )}
            </div>

            {/* 6. Eliminar */}
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpenJobId(null);
                  handleDeleteJob(j);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2.5 transition cursor-pointer font-bold"
              >
                <Trash2 className="w-4 h-4" />
                <span>Eliminar Trabalho</span>
              </button>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* =================================================================== */}
      {/* MODAL DE EDIÇÃO DO TRABALHO DE MIGRAÇÃO                            */}
      {/* =================================================================== */}
      {editingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#1a2533] rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full p-6 space-y-5 text-slate-800 dark:text-white max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900 font-heading">
                  Editar Trabalho de Migração
                </span>
                <h3 className="text-base font-black text-[#223546] dark:text-white mt-1 font-heading">
                  {editingJob.sourceGroupEmail}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Conta de Origem:
                </label>
                <input
                  type="text"
                  disabled
                  value={editingJob.sourceGroupEmail}
                  className="w-full p-2.5 bg-slate-100 dark:bg-[#121921] border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Conta de Destino:
                </label>
                <input
                  type="email"
                  value={editTargetEmail}
                  onChange={(e) => setEditTargetEmail(e.target.value)}
                  placeholder="destino@dominio.com"
                  className="w-full p-2.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Estado do Trabalho:
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#e95c0c]"
                >
                  <option value="PREPARING">PREPARING (Em Preparação)</option>
                  <option value="READY_TO_IMPORT">READY_TO_IMPORT (Pronto p/ Importar)</option>
                  <option value="AWAITING_PURVIEW_JOB">AWAITING_PURVIEW_JOB (Aguardando Purview)</option>
                  <option value="IN_PROGRESS">IN_PROGRESS (Em Execução)</option>
                  <option value="COMPLETED">COMPLETED (Concluído)</option>
                  <option value="FAILED">FAILED (Com Falha)</option>
                  <option value="CANCELLED">CANCELLED (Cancelado)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Referência / Purview Job ID:
                </label>
                <input
                  type="text"
                  value={editPurviewJobId}
                  onChange={(e) => setEditPurviewJobId(e.target.value)}
                  placeholder="Ex: Purview-Job-20261002"
                  className="w-full p-2.5 bg-white dark:bg-[#15202c] border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#e95c0c]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tipos de Conteúdo Selecionados:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_TYPES.filter((t) => (editingJob?.scope === "GROUPS" ? !["CALENDARS", "CONTACTS"].includes(t.id) : true)).map((t) => {
                    const isChecked = editSelectedTypes.includes(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          isChecked
                            ? "bg-[#e95c0c]/10 border-[#e95c0c]/40 text-[#e95c0c] font-bold"
                            : "bg-slate-50 dark:bg-[#121921] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setEditSelectedTypes((prev) =>
                              prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                            );
                          }}
                          className="rounded text-[#e95c0c] focus:ring-[#e95c0c]"
                        />
                        <span>{t.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditJob}
                className="px-4 py-2 rounded-xl bg-[#e95c0c] hover:bg-[#d4530a] text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Guardar Alterações
              </button>
            </div>
          </div>
        </div>
      )}


      {/* =================================================================== */}
      {/* 6. MODAL DE LOGS EM TEMPO REAL (STREAMING DE LOGS)                  */}
      {/* =================================================================== */}
      {liveLogsJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#0f1722] text-slate-100 rounded-3xl border border-slate-700 shadow-2xl max-w-4xl w-full p-6 space-y-5 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#e95c0c]/20 text-[#e95c0c] border border-[#e95c0c]/40 font-heading flex items-center gap-1.5">
                    <Terminal className="w-3 h-3" /> Logs em Tempo Real
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      liveLogsJob.status === "COMPLETED"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : liveLogsJob.status === "IMPORTING"
                        ? "bg-blue-950 text-blue-300 border border-blue-800 animate-pulse"
                        : liveLogsJob.status === "FAILED"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {liveLogsJob.status}
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-1.5 font-heading">
                  {liveLogsJob.sourceGroupEmail} ➔ {liveLogsJob.targetMailboxEmail}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLiveLogsJob(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#15202e] rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Itens</span>
                <p className="text-lg font-black text-white mt-0.5 font-heading">
                  {logsData?.job?.totalItems || liveLogsJob.totalItems || liveLogsJob.validItems || 0}
                </p>
              </div>
              <div className="p-3 bg-[#15202e] rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Itens Importados</span>
                <p className="text-lg font-black text-emerald-400 mt-0.5 font-heading">
                  {logsData?.job?.importedItems ?? liveLogsJob.importedItems ?? 0}
                </p>
              </div>
              <div className="p-3 bg-[#15202e] rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duplicados Ignorados</span>
                <p className="text-lg font-black text-amber-400 mt-0.5 font-heading">
                  {logsData?.job?.duplicateItems ?? liveLogsJob.duplicateItems ?? 0}
                </p>
              </div>
              <div className="p-3 bg-[#15202e] rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Falhas / Erros</span>
                <p className="text-lg font-black text-rose-400 mt-0.5 font-heading">
                  {logsData?.job?.failedItems ?? liveLogsJob.failedItems ?? 0}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Progresso da Execução</span>
                <span className="font-bold text-white">
                  {Math.min(
                    100,
                    Math.round(
                      (((logsData?.job?.importedItems ?? liveLogsJob.importedItems ?? 0) /
                        (logsData?.job?.totalItems || liveLogsJob.totalItems || liveLogsJob.validItems || 1)) *
                        100)
                    )
                  )}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#e95c0c] transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.max(
                      4,
                      Math.min(
                        100,
                        Math.round(
                          (((logsData?.job?.importedItems ?? liveLogsJob.importedItems ?? 0) /
                            (logsData?.job?.totalItems || liveLogsJob.totalItems || liveLogsJob.validItems || 1)) *
                            100)
                        )
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Logs Console Box */}
            <div className="flex-1 min-h-[260px] max-h-[380px] bg-[#070b10] rounded-2xl border border-slate-800 p-4 font-mono text-[11px] overflow-y-auto space-y-2 select-text" ref={logsContainerRef}>
              {loadingLogs && (!logsData || logsData.events.length === 0) ? (
                <div className="h-full flex items-center justify-center text-slate-500">
                  <Activity className="w-4 h-4 animate-spin mr-2" /> A sincronizar stream de logs...
                </div>
              ) : !logsData?.events || logsData.events.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Nenhum evento de log registado ainda. Clique em &apos;Iniciar Migração&apos; para começar.
                </div>
              ) : (
                logsData.events.map((ev: any, idx: number) => {
                  const dateStr = new Date(ev.createdAt).toLocaleTimeString();
                  const isErr = ev.status === "ERROR";
                  const isWarn = ev.status === "WARNING";
                  const isSucc = ev.status === "SUCCESS";
                  return (
                    <div
                      key={ev.id || idx}
                      className={`leading-relaxed flex items-start gap-2.5 p-1 rounded ${
                        isErr
                          ? "bg-rose-950/40 text-rose-300"
                          : isWarn
                          ? "bg-amber-950/30 text-amber-300"
                          : isSucc
                          ? "text-emerald-300"
                          : "text-slate-300"
                      }`}
                    >
                      <span className="text-slate-500 shrink-0 select-none">[{dateStr}]</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                          isErr
                            ? "bg-rose-900 text-white"
                            : isWarn
                            ? "bg-amber-900 text-amber-200"
                            : isSucc
                            ? "bg-emerald-900 text-emerald-200"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {ev.step || ev.status}
                      </span>
                      <span className="break-all">{ev.message}</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const textLogs = logsData?.events
                      ?.map((e: any) => `[${new Date(e.createdAt).toISOString()}] [${e.status}] ${e.message}`)
                      .join("\n") || "";
                    navigator.clipboard.writeText(textLogs);
                    toast.success("Copiado!", "Logs copiados para a área de transferência.");
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar Logs
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const textLogs = logsData?.events
                      ?.map((e: any) => `[${new Date(e.createdAt).toISOString()}] [${e.status}] ${e.message}`)
                      .join("\n") || "";
                    const blob = new Blob([textLogs], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `migration-log-${liveLogsJob.id}.log`;
                    a.click();
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Descarregar .log
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Botão Analisar Erro & Retomar */}
                <button
                  type="button"
                  onClick={() => handleDiagnoseAndResume(liveLogsJob)}
                  className="px-3.5 py-1.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Analisar Erro & Retomar</span>
                </button>

                {liveLogsJob.status === "IMPORTING" ? (
                  <button
                    type="button"
                    onClick={() => handlePauseJob(liveLogsJob)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pausar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartJob(liveLogsJob)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" /> Iniciar / Retomar
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLiveLogsJob(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 7. MODAL DE DIAGNÓSTICO INTELIGENTE & AUTO-RECUPERAÇÃO              */}
      {/* =================================================================== */}
      {diagnosticResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs p-4 overflow-y-auto animate-in zoom-in-95 duration-150">
          <div className="bg-white dark:bg-[#1a2533] rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-xl w-full p-6 space-y-5 text-slate-800 dark:text-white">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 font-heading">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Auto-Recuperação Concluída
                </span>
                <h3 className="text-base font-black text-[#223546] dark:text-white mt-1.5 font-heading">
                  Diagnóstico & Retoma Automática
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDiagnosticResult(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Causa Raiz */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-1">
                <span className="font-black text-amber-900 dark:text-amber-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-heading">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Causa Detetada
                </span>
                <p className="text-amber-900/90 dark:text-amber-300 font-medium leading-relaxed">
                  {diagnosticResult.rootCause}
                </p>
              </div>

              {/* Correção Aplicada */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 space-y-1">
                <span className="font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-heading">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Ação Corretiva Executada
                </span>
                <p className="text-emerald-900/90 dark:text-emerald-300 font-medium leading-relaxed">
                  {diagnosticResult.remediationAction}
                </p>
              </div>

              {/* Checkpoint de Continuidade */}
              <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 space-y-1">
                <span className="font-black text-sky-900 dark:text-sky-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-heading">
                  <RotateCcw className="w-3.5 h-3.5 text-sky-600" /> Ponto de Retoma Seguro
                </span>
                <p className="text-sky-900/90 dark:text-sky-300 font-medium leading-relaxed">
                  A migração continua exatamente a partir do <strong>item {diagnosticResult.resumedFromItem}</strong> de {diagnosticResult.totalItems}. Os dados já migrados foram preservados intactos, sem duplicações.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDiagnosticResult(null)}
                className="px-4 py-2 bg-[#e95c0c] hover:bg-[#d04f08] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-md"
              >
                Acompanhar nos Logs em Direto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
