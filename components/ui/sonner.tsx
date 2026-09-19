"use client";

import {
  Toaster as Sonner,
  type ToastClassnames,
  type ToasterProps,
} from "sonner";

import { AlertTriangle, CircleCheckBig, CircleX, Info } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toastVariantClassNames, type ToastVariant, type VecalssToastOptions } from "./toast";

const defaultToastClassNames: ToastClassnames = {
  actionButton: "rounded-lg bg-primary-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-800",
  cancelButton: "rounded-lg bg-secondary-100 px-2.5 py-1.5 text-xs font-semibold text-secondary-700 hover:bg-secondary-200",
  closeButton: "!left-auto !right-2 !top-1/2 !translate-x-0 !-translate-y-1/2 rounded-lg border-0 bg-transparent text-secondary-500 opacity-100 hover:bg-secondary-100 hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30",
  content: "min-w-0",
  default: toastVariantClassNames.default,
  description: "pr-8 text-xs leading-5 text-secondary-600",
  error: toastVariantClassNames.error,
  icon: "size-5",
  info: toastVariantClassNames.info,
  success: toastVariantClassNames.success,
  title: "pr-8 text-sm font-semibold text-secondary-950",
  toast: "group/sonner-toast relative w-[min(calc(100vw-2rem),28rem)] rounded-2xl border px-4 py-3 shadow-[0_18px_48px_-24px_color-mix(in_oklab,var(--voyage-deep)_45%,transparent)]",
  warning: toastVariantClassNames.warning,
};

function Toaster({ className, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      {...props}
      className={cn("toaster group", className)}
      closeButton
      duration={4500}
      gap={12}
      icons={{
        error: <CircleX aria-hidden="true" className="text-student-status-danger-fg" />,
        info: <Info aria-hidden="true" className="text-primary-700" />,
        success: <CircleCheckBig aria-hidden="true" className="text-student-status-success-fg" />,
        warning: <AlertTriangle aria-hidden="true" className="text-student-status-attention-fg" />,
      }}
      mobileOffset={{ bottom: 16, left: 16, right: 16 }}
      offset={24}
      position="bottom-center"
      richColors={false}
      swipeDirections={["bottom", "left", "right"]}
      toastOptions={{
        ...toastOptions,
        className: cn("group/sonner-toast", toastOptions?.className),
        classNames: {
          ...defaultToastClassNames,
          ...toastOptions?.classNames,
        },
        closeButton: toastOptions?.closeButton ?? true,
        closeButtonAriaLabel: toastOptions?.closeButtonAriaLabel ?? "Tutup notifikasi",
        duration: toastOptions?.duration ?? 4500,
      }}
      visibleToasts={3}
    />
  );
}

export { Toaster };
export type { ToastVariant, VecalssToastOptions };
