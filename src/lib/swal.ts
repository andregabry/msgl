import Swal, { SweetAlertOptions, SweetAlertResult } from "sweetalert2";

/**
 * Checks whether the application is currently running in Dark Mode.
 */
export function isDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Returns dynamic theme settings and classes based on Dark vs Light mode.
 */
export function getSwalThemeConfig(dark: boolean, isToast: boolean = false) {
  if (dark) {
    return {
      background: "#1c2836",
      color: "#ffffff",
      customClass: {
        popup: isToast
          ? "border border-slate-700/80 rounded-xl shadow-xl p-4 bg-[#1c2836] text-white"
          : "border border-slate-700/80 rounded-2xl shadow-2xl p-6 bg-[#1c2836] text-white",
        title: isToast
          ? "text-sm font-bold text-white tracking-tight"
          : "text-lg font-extrabold text-white tracking-tight",
        htmlContainer: isToast
          ? "text-xs text-slate-300 font-medium"
          : "text-sm text-slate-300 font-medium leading-relaxed",
        confirmButton:
          "inline-flex items-center justify-center px-4 py-2.5 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
        cancelButton:
          "inline-flex items-center justify-center px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
        denyButton:
          "inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
        input:
          "w-full bg-[#121921] border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#e95c0c]",
        loader: "text-[#e95c0c]",
      },
    };
  } else {
    return {
      background: "#ffffff",
      color: "#1e293b",
      customClass: {
        popup: isToast
          ? "border border-slate-200 rounded-xl shadow-xl p-4 bg-white text-slate-800"
          : "border border-slate-200 rounded-2xl shadow-xl p-6 bg-white text-slate-800",
        title: isToast
          ? "text-sm font-bold text-slate-900 tracking-tight"
          : "text-lg font-extrabold text-[#223546] tracking-tight",
        htmlContainer: isToast
          ? "text-xs text-slate-600 font-medium"
          : "text-sm text-slate-600 font-medium leading-relaxed",
        confirmButton:
          "inline-flex items-center justify-center px-4 py-2.5 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
        cancelButton:
          "inline-flex items-center justify-center px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
        denyButton:
          "inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
        input:
          "w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#e95c0c]",
        loader: "text-[#e95c0c]",
      },
    };
  }
}

/**
 * Enterprise SweetAlert2 configured for the Migrate System Platform.
 * Supports both Light and Dark modes dynamically.
 * Zero dark background overlay (transparent backdrop).
 */
export const AppSwal = {
  ...Swal,
  fire: (...args: any[]): Promise<any> => {
    const dark = isDarkMode();
    let opts: SweetAlertOptions = {};
    if (typeof args[0] === "string") {
      opts = { title: args[0], html: args[1], icon: args[2] };
    } else if (args[0]) {
      opts = { ...args[0] };
    }

    const isToast = Boolean(opts.toast);
    const theme = getSwalThemeConfig(dark, isToast);

    return Swal.fire({
      buttonsStyling: false,
      backdrop: isToast ? false : "transparent",
      ...theme,
      ...opts,
      customClass: {
        ...theme.customClass,
        ...(opts.customClass || {}),
      },
    });
  },
  showValidationMessage: (msg: string) => Swal.showValidationMessage(msg),
  resetValidationMessage: () => Swal.resetValidationMessage(),
  isVisible: () => Swal.isVisible(),
  close: (result?: any) => Swal.close(result),
  showLoading: () => Swal.showLoading(),
  hideLoading: () => Swal.hideLoading(),
  isLoading: () => Swal.isLoading(),
};

/**
 * Sleek floating toast notifications (top-end, with no dark backdrop overlay)
 */
export const toast = {
  success: (title: string, message?: string) => {
    return AppSwal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: title,
      text: message,
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      backdrop: false,
    });
  },

  error: (title: string, message?: string) => {
    return AppSwal.fire({
      toast: true,
      position: "top-end",
      icon: "error",
      title: title,
      text: message,
      showConfirmButton: false,
      timer: 4500,
      timerProgressBar: true,
      backdrop: false,
    });
  },

  warning: (title: string, message?: string) => {
    return AppSwal.fire({
      toast: true,
      position: "top-end",
      icon: "warning",
      title: title,
      text: message,
      showConfirmButton: false,
      timer: 4000,
      timerProgressBar: true,
      backdrop: false,
    });
  },

  info: (title: string, message?: string) => {
    return AppSwal.fire({
      toast: true,
      position: "top-end",
      icon: "info",
      title: title,
      text: message,
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      backdrop: false,
    });
  },
};

/**
 * Modal alerts with confirmation buttons and transparent backdrop (no dark screen)
 */
export const dialog = {
  success: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "success",
      title,
      text,
      confirmButtonText: "Entendido",
      backdrop: "transparent",
      ...options,
    });
  },

  error: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "error",
      title,
      text,
      confirmButtonText: "Fechar",
      backdrop: "transparent",
      ...options,
    });
  },

  warning: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "warning",
      title,
      text,
      confirmButtonText: "OK",
      backdrop: "transparent",
      ...options,
    });
  },

  info: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "info",
      title,
      text,
      confirmButtonText: "OK",
      backdrop: "transparent",
      ...options,
    });
  },
};

/**
 * Interactive confirmation modal (no dark overlay)
 */
export async function confirmAction(options: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "info" | "error";
  danger?: boolean;
}): Promise<boolean> {
  const dark = isDarkMode();
  const theme = getSwalThemeConfig(dark, false);
  const result: SweetAlertResult = await AppSwal.fire({
    title: options.title,
    text: options.text,
    icon: options.icon || "warning",
    showCancelButton: true,
    confirmButtonText: options.confirmText || "Confirmar",
    cancelButtonText: options.cancelText || "Cancelar",
    backdrop: "transparent",
    customClass: {
      ...theme.customClass,
      confirmButton: options.danger
        ? "inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1"
        : "inline-flex items-center justify-center px-4 py-2.5 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
      cancelButton: dark
        ? "inline-flex items-center justify-center px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1"
        : "inline-flex items-center justify-center px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
    },
  });

  return result.isConfirmed;
}

/**
 * Loading dialog with spinner and transparent background
 */
export function showLoading(title: string = "A processar...", text: string = "Por favor, aguarde.") {
  AppSwal.fire({
    title,
    text,
    backdrop: "transparent",
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

/**
 * Close any active SweetAlert modal/loading
 */
export function hideLoading() {
  if (Swal.isVisible()) {
    Swal.close();
  }
}

export { Swal };
export default AppSwal;
