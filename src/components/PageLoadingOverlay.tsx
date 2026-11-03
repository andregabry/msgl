"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Layers } from "lucide-react";

/**
 * Global events for programmatic loading trigger
 */
export function triggerPageLoading(message?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("app:page-loading-start", { detail: { message } })
    );
  }
}

export function dismissPageLoading() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:page-loading-end"));
  }
}

/**
 * Route listener wrapped in Suspense for Next.js App Router compatibility
 */
function RouteChangeListener({
  onRouteChange,
}: {
  onRouteChange: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    onRouteChange();
  }, [pathname, searchParams, onRouteChange]);

  return null;
}

export default function PageLoadingOverlay() {
  // 1. Initial app open loading state (starts active on page load/refresh)
  const [initialLoading, setInitialLoading] = useState(true);

  // 2. Page transition navigation loading state
  const [navigating, setNavigating] = useState(false);
  const [loadingText, setLoadingText] = useState("A carregar...");

  // Control visibility and fading
  const isVisible = initialLoading || navigating;

  // Initial load timer: keep loader visible briefly so user sees polished entrance
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // When route changes, dismiss navigation loading smoothly
  const handleRouteChange = useCallback(() => {
    const timer = setTimeout(() => {
      setNavigating(false);
    }, 240);
    return () => clearTimeout(timer);
  }, []);

  // Intercept link clicks across the entire app
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Only process standard left-clicks without modifier keys
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      const targetAttr = anchor.getAttribute("target");

      // Skip invalid, external, download, anchor hash, or special protocols
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        targetAttr === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      try {
        const nextUrl = new URL(href, window.location.href);
        const currentUrl = new URL(window.location.href);

        // Skip navigation to external domains
        if (nextUrl.origin !== currentUrl.origin) {
          return;
        }

        // Only trigger if path or query string is actually different
        const isSamePath =
          nextUrl.pathname === currentUrl.pathname &&
          nextUrl.search === currentUrl.search;

        if (isSamePath) {
          return;
        }

        let destText = "A carregar...";
        if (nextUrl.pathname.includes("/admin/audit")) destText = "A carregar Auditoria...";
        else if (nextUrl.pathname.includes("/google/accounts")) destText = "A carregar Contas Google...";
        else if (nextUrl.pathname.includes("/google/groups")) destText = "A carregar Grupos Google...";
        else if (nextUrl.pathname.includes("/backups")) destText = "A carregar Backups & Storage...";
        else if (nextUrl.pathname.includes("/portal/chat")) destText = "A carregar Google Chat...";
        else if (nextUrl.pathname.includes("/chat")) destText = "A carregar Arquivo de Chat...";
        else if (nextUrl.pathname.includes("/microsoft")) destText = "A carregar Microsoft 365...";
        else if (nextUrl.pathname.includes("/migration")) destText = "A carregar Migração...";
        else if (nextUrl.pathname.includes("/admin/integrations")) destText = "A carregar Conexões Cloud...";
        else if (nextUrl.pathname.includes("/admin/email")) destText = "A carregar Servidor de E-mail...";
        else if (nextUrl.pathname.includes("/admin/users")) destText = "A carregar Utilizadores...";

        setLoadingText(destText);
        setNavigating(true);
      } catch (err) {
        // Ignore URL parsing errors
      }
    };

    // Intercept browser back / forward navigation
    const handlePopState = () => {
      setLoadingText("A carregar...");
      setNavigating(true);
    };

    // Intercept programmatic history.pushState / history.replaceState
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      try {
        const url = args[2];
        if (url) {
          const nextUrl = new URL(url.toString(), window.location.href);
          if (
            nextUrl.pathname !== window.location.pathname ||
            nextUrl.search !== window.location.search
          ) {
            setLoadingText("A carregar...");
            setNavigating(true);
          }
        }
      } catch (e) {}
      return originalPushState.apply(this, args);
    };

    window.history.replaceState = function (...args) {
      return originalReplaceState.apply(this, args);
    };

    // Custom events
    const handleCustomStart = (e: any) => {
      if (e.detail?.message) setLoadingText(e.detail.message);
      else setLoadingText("A carregar...");
      setNavigating(true);
    };

    const handleCustomEnd = () => {
      setNavigating(false);
      setInitialLoading(false);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("app:page-loading-start", handleCustomStart);
    window.addEventListener("app:page-loading-end", handleCustomEnd);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("app:page-loading-start", handleCustomStart);
      window.removeEventListener("app:page-loading-end", handleCustomEnd);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  // Safety ceiling: prevent loader from hanging if page navigation is aborted
  useEffect(() => {
    if (navigating) {
      const safetyTimeout = setTimeout(() => {
        setNavigating(false);
      }, 4500);
      return () => clearTimeout(safetyTimeout);
    }
  }, [navigating]);

  return (
    <>
      <Suspense fallback={null}>
        <RouteChangeListener onRouteChange={handleRouteChange} />
      </Suspense>

      {/* ----------------------------------------------------------------- */}
      {/* TELA DE FUNDO FOSCA LEVEMENTE ESCURECIDA COM ÊNFASE NO LOADING     */}
      {/* ----------------------------------------------------------------- */}
      <div
        role="status"
        aria-live="polite"
        aria-busy={isVisible}
        className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center select-none transition-all duration-300 ease-out ${
          isVisible
            ? "opacity-100 pointer-events-auto visible"
            : "opacity-0 pointer-events-none invisible"
        }`}
        style={{
          // Fundo fosco com desfoque e levemente escurecido
          backgroundColor: "rgba(10, 15, 23, 0.45)",
          backdropFilter: isVisible ? "blur(12px) brightness(0.80)" : "none",
          WebkitBackdropFilter: isVisible ? "blur(12px) brightness(0.80)" : "none",
        }}
      >
        {/* Animação central de Loading com Ênfase Total (Sem caixas ou molduras) */}
        <div
          className={`flex flex-col items-center justify-center transition-all duration-300 ease-out ${
            isVisible ? "scale-100 opacity-100" : "scale-90 opacity-0"
          }`}
        >
          {/* Double Concentric Spinner & Glowing Brand Emblem */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            {/* Outer Glowing Orange Ring */}
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{
                border: "3.5px solid rgba(233, 92, 12, 0.15)",
                borderTopColor: "#e95c0c",
                borderRightColor: "#e95c0c",
                filter: "drop-shadow(0 0 16px rgba(233, 92, 12, 0.85))",
                animationDuration: "0.9s",
              }}
            />

            {/* Inner Counter-Rotating Azure Ring */}
            <div
              className="absolute w-16 h-16 rounded-full animate-spin-reverse"
              style={{
                border: "2.5px solid rgba(56, 189, 248, 0.15)",
                borderBottomColor: "#38bdf8",
                borderLeftColor: "rgba(56, 189, 248, 0.85)",
                filter: "drop-shadow(0 0 10px rgba(56, 189, 248, 0.5))",
                animationDuration: "1.6s",
              }}
            />

            {/* Glowing Icon in the Center */}
            <div className="relative z-10 w-10 h-10 rounded-2xl bg-black/40 border border-white/15 flex items-center justify-center shadow-lg backdrop-blur-sm">
              <Layers className="w-5 h-5 text-[#e95c0c] animate-pulse" />
            </div>
          </div>

          {/* Minimalist Floating Label */}
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.25em] text-white/90 drop-shadow-md flex items-center gap-1.5 animate-pulse">
            <span>{loadingText}</span>
          </p>
        </div>
      </div>
    </>
  );
}
