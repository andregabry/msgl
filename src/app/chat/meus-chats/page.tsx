"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { toast, dialog } from "@/lib/swal";

export default function MyChatsPage() {
  const [spaces, setSpaces] = useState<any[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filters
  const [spaceFilter, setSpaceFilter] = useState<"ALL" | "DIRECT_MESSAGE" | "GROUP_CHAT" | "SPACE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [participantFilter, setParticipantFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchSpaces = async () => {
    setLoadingSpaces(true);
    try {
      const res = await fetch("/api/chat/spaces");
      if (res.ok) {
        const data = await res.json();
        setSpaces(data.spaces || []);
        if (data.spaces && data.spaces.length > 0) {
          setSelectedSpace(data.spaces[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSpaces(false);
    }
  };

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
      console.error(err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleGlobalSearch = async () => {
    if (!searchQuery.trim() && !participantFilter.trim()) {
      if (selectedSpace) fetchMessages(selectedSpace.id);
      return;
    }

    setLoadingMessages(true);
    try {
      let url = `/api/chat/search?q=${encodeURIComponent(searchQuery)}&limit=100`;
      if (selectedSpace) url += `&spaceId=${selectedSpace.id}`;
      if (participantFilter) url += `&participantEmail=${encodeURIComponent(participantFilter)}`;
      if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.results || []);
        if (data.results && data.results.length === 0) {
          toast.info("Nenhuma mensagem encontrada", "Tente pesquisar por outros termos ou ampliar os filtros.");
        } else {
          toast.success("Pesquisa Concluída", `${data.results.length} mensagens encontradas no arquivo.`);
        }
      } else {
        toast.error("Erro na Pesquisa", "Não foi possível pesquisar no arquivo histórico.");
      }
    } catch (err: any) {
      toast.error("Falha", err.message || "Erro inesperado.");
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchSpaces();
  }, []);

  useEffect(() => {
    if (selectedSpace) {
      fetchMessages(selectedSpace.id);
    }
  }, [selectedSpace, startDate, endDate]);

  const filteredSpaces = spaces.filter((s) => {
    if (spaceFilter !== "ALL" && s.spaceType !== spaceFilter) return false;
    return true;
  });

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#223546] flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#e95c0c]" />
            Portal do Utilizador — Meus Chats Históricos
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Consulte os seus arquivos históricos do Google Chat, conversas diretas, grupos e anexos preservados.
          </p>
        </div>
      </div>

      {/* Main Chat Interface Layout */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs flex overflow-hidden">
        {/* Left Sidebar: Conversations & Search */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
          {/* Search Input */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar conversas ou texto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGlobalSearch()}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#e95c0c]"
              />
            </div>
          </div>

          {/* Space Type Tabs */}
          <div className="flex border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500">
            <button
              onClick={() => setSpaceFilter("ALL")}
              className={`flex-1 py-2 text-center border-b-2 transition ${
                spaceFilter === "ALL" ? "border-[#e95c0c] text-[#e95c0c]" : "border-transparent"
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setSpaceFilter("DIRECT_MESSAGE")}
              className={`flex-1 py-2 text-center border-b-2 transition ${
                spaceFilter === "DIRECT_MESSAGE" ? "border-[#e95c0c] text-[#e95c0c]" : "border-transparent"
              }`}
            >
              Diretas
            </button>
            <button
              onClick={() => setSpaceFilter("SPACE")}
              className={`flex-1 py-2 text-center border-b-2 transition ${
                spaceFilter === "SPACE" ? "border-[#e95c0c] text-[#e95c0c]" : "border-transparent"
              }`}
            >
              Spaces
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingSpaces ? (
              <div className="p-8 text-center text-xs text-slate-400">A carregar conversas...</div>
            ) : filteredSpaces.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">Nenhuma conversa encontrada.</div>
            ) : (
              filteredSpaces.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSpace(s)}
                  className={`w-full p-3 text-left flex items-start gap-3 transition cursor-pointer ${
                    selectedSpace?.id === s.id ? "bg-orange-50/70 border-l-4 border-[#e95c0c]" : "hover:bg-slate-100/60"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-600 shrink-0">
                    {s.spaceType === "DIRECT_MESSAGE" ? <User className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-[#223546] truncate">{s.displayName}</div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      {s._count?.messages ?? 0} mensagens arquivadas
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Area: Messages View */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Active Conversation Header */}
          {selectedSpace ? (
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#e95c0c] flex items-center justify-center font-black">
                  {selectedSpace.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-sm font-black text-[#223546]">{selectedSpace.displayName}</h2>
                  <div className="text-[11px] text-slate-400 font-medium flex items-center gap-2">
                    <span className="uppercase font-bold tracking-wider text-[10px] text-slate-500">
                      {selectedSpace.spaceType}
                    </span>
                    <span>•</span>
                    <span>{messages.length} mensagens nesta vista</span>
                  </div>
                </div>
              </div>

              {/* Date Filter Inputs */}
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="p-1 border border-slate-200 rounded text-slate-600 text-[11px]"
                  title="Data inicial"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="p-1 border border-slate-200 rounded text-slate-600 text-[11px]"
                  title="Data final"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-slate-200 text-xs text-slate-400">
              Selecione uma conversa para visualizar o histórico.
            </div>
          )}

          {/* Messages Stream */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {loadingMessages ? (
              <div className="py-20 text-center text-xs text-slate-400">A carregar mensagens...</div>
            ) : messages.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-400">
                Nenhuma mensagem disponível para os filtros selecionados.
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="flex items-start gap-3 text-xs group">
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200">
                    {m.senderName ? m.senderName.charAt(0).toUpperCase() : "U"}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-900">{m.senderName || m.senderEmail}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(m.sentAt).toLocaleString("pt-PT")}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-800 leading-relaxed whitespace-pre-wrap">
                      {m.text}
                    </div>

                    {/* Attachments */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((att: any) => (
                          <div
                            key={att.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-semibold shadow-2xs hover:bg-slate-50 transition"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-[#e95c0c]" />
                            <span>{att.filename}</span>
                            <span className="text-[10px] text-slate-400">({att.bytes} B)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
