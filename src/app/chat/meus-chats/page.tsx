"use client";

import { useEffect } from "react";
import { MessageSquare, ExternalLink } from "lucide-react";

export default function MyChatsPage() {
  useEffect(() => {
    window.location.replace("https://googlechat.enging.pt/portal/chat");
  }, []);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4 border border-teal-200 dark:border-teal-800 shadow-xs">
        <MessageSquare className="w-8 h-8 stroke-[2.2]" />
      </div>
      <h2 className="text-xl font-black text-slate-800 dark:text-white">
        A redirecionar para o Portal Google Chat...
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md">
        Por motivos de privacidade e conformidade de dados, o arquivo de conversas é acedido exclusivamente através do portal dedicado autenticado.
      </p>
      <a
        href="https://googlechat.enging.pt/portal/chat"
        className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-[#e95c0c] hover:bg-[#d04f08] text-white rounded-lg text-sm font-bold shadow-xs transition"
      >
        <span>Aceder a googlechat.enging.pt</span>
        <ExternalLink className="w-4 h-4" />
      </a>
    </div>
  );
}
