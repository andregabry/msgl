import Swal, { SweetAlertOptions, SweetAlertResult } from "sweetalert2";

/**
 * Enterprise SweetAlert2 configured for the Migrate System Platform.
 * Matches the Dual-Dark Palette with #e95c0c orange accents and frosted glass backdrops.
 */
export const AppSwal = Swal.mixin({
  background: "#1c2836",
  color: "#ffffff",
  buttonsStyling: false,
  customClass: {
    popup: "border border-slate-700/70 rounded-2xl shadow-2xl p-6",
    title: "text-lg font-extrabold text-white tracking-tight",
    htmlContainer: "text-sm text-slate-300 font-medium leading-relaxed",
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
});

/**
 * Sleek floating toast notifications (top-end)
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
    });
  },
};

/**
 * Modal alerts with confirmation buttons
 */
export const dialog = {
  success: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "success",
      title,
      text,
      confirmButtonText: "Entendido",
      ...options,
    });
  },

  error: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "error",
      title,
      text,
      confirmButtonText: "Fechar",
      ...options,
    });
  },

  warning: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "warning",
      title,
      text,
      confirmButtonText: "OK",
      ...options,
    });
  },

  info: (title: string, text?: string, options?: SweetAlertOptions) => {
    return AppSwal.fire({
      icon: "info",
      title,
      text,
      confirmButtonText: "OK",
      ...options,
    });
  },
};

/**
 * Interactive confirmation modal
 */
export async function confirmAction(options: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: "warning" | "question" | "info" | "error";
  danger?: boolean;
}): Promise<boolean> {
  const result: SweetAlertResult = await AppSwal.fire({
    title: options.title,
    text: options.text,
    icon: options.icon || "warning",
    showCancelButton: true,
    confirmButtonText: options.confirmText || "Confirmar",
    cancelButtonText: options.cancelText || "Cancelar",
    customClass: {
      confirmButton: options.danger
        ? "inline-flex items-center justify-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1"
        : "inline-flex items-center justify-center px-4 py-2.5 bg-[#e95c0c] hover:bg-[#c84c06] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
      cancelButton:
        "inline-flex items-center justify-center px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer mx-1",
    },
  });

  return result.isConfirmed;
}

/**
 * Fullscreen / Frosted Glass Loading dialog with spinner
 */
export function showLoading(title: string = "A processar...", text: string = "Por favor, aguarde.") {
  AppSwal.fire({
    title,
    text,
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
