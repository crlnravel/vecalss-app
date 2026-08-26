import type { ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";

import { cn } from "@/lib/utils";

type ToastVariant = "default" | "error" | "info" | "success" | "warning";

type VecalssToastOptions = Omit<ExternalToast, "className"> & {
  className?: string;
  variant?: ToastVariant;
};

const toastVariantClassNames: Record<ToastVariant, string> = {
  default: "!border-primary-200 !bg-white !text-secondary-900",
  error: "!border-student-status-danger-border !bg-student-status-danger-bg !text-student-status-danger-fg",
  info: "!border-primary-200 !bg-primary-50 !text-primary-800",
  success: "!border-student-status-success-border !bg-student-status-success-bg !text-student-status-success-fg",
  warning: "!border-student-status-attention-border !bg-student-status-attention-bg !text-student-status-attention-fg",
};

function showToast(message: ReactNode, { variant = "default", ...options }: VecalssToastOptions = {}) {
  const emit = variant === "success"
    ? sonnerToast.success
    : variant === "error"
      ? sonnerToast.error
      : variant === "info"
        ? sonnerToast.info
        : variant === "warning"
          ? sonnerToast.warning
          : sonnerToast;

  return emit(message, {
    ...options,
    className: cn(toastVariantClassNames[variant], options.className),
  });
}

export { showToast, sonnerToast as toast, toastVariantClassNames };
export type { ToastVariant, VecalssToastOptions };
