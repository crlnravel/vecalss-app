"use client";

import {
  Toaster as Sonner,
  type ToastClassnames,
  type ToasterProps,
} from "sonner";

import { AlertTriangle, CircleCheckBig, CircleX, Info } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button-variants";
import styles from "./sonner-layout.module.css";
import { toastVariantClassNames, type ToastVariant, type VecalssToastOptions } from "./toast";

const SONNER_BUTTON_CASCADE_CLASSES =
  "min-h-[44px] !rounded-control !border !px-3.5 !text-sm !transition-[transform,background-color,border-color,box-shadow,color] focus-visible:!ring-3 focus-visible:!ring-offset-2 motion-reduce:!transition-none";
const SONNER_ACTION_BUTTON_CASCADE_CLASSES =
  `${SONNER_BUTTON_CASCADE_CLASSES} !border-voyage-deep !bg-voyage-deep !text-white hover:!border-voyage-deep-hover hover:!bg-voyage-deep-hover focus-visible:!border-voyage-deep`;
const SONNER_CANCEL_BUTTON_CASCADE_CLASSES =
  `${SONNER_BUTTON_CASCADE_CLASSES} !border-voyage-soft-border !bg-voyage-surface !text-voyage-ink hover:!border-voyage-leaf/45 hover:!bg-voyage-sea-glass-wash focus-visible:!border-voyage-leaf`;

const defaultToastClassNames: ToastClassnames = {
  actionButton: buttonVariants({
    className: SONNER_ACTION_BUTTON_CASCADE_CLASSES,
    variant: "default",
    size: "sm",
  }),
  cancelButton: buttonVariants({
    className: SONNER_CANCEL_BUTTON_CASCADE_CLASSES,
    variant: "outline",
    size: "sm",
  }),
  closeButton: `${styles.closeButton} !min-h-[44px] !min-w-[44px] !rounded-control !border-0 !bg-transparent !text-secondary-500 !opacity-100 hover:!bg-secondary-100 hover:!text-secondary-900 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-primary-700/30`,
  content: styles.content,
  default: toastVariantClassNames.default,
  description: `${styles.text} text-xs leading-5 text-secondary-600`,
  error: toastVariantClassNames.error,
  icon: styles.icon,
  info: toastVariantClassNames.info,
  success: toastVariantClassNames.success,
  title: `${styles.text} text-sm font-semibold text-secondary-950`,
  toast: `${styles.toast} group/sonner-toast !rounded-field border shadow-[0_18px_48px_-24px_color-mix(in_oklab,var(--voyage-deep)_45%,transparent)]`,
  warning: toastVariantClassNames.warning,
};

function Toaster({ className, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      {...props}
      className={cn("toaster group", styles.viewport, className)}
      closeButton
      duration={4500}
      expand
      gap={12}
      icons={{
        error: <CircleX aria-hidden="true" className="text-student-status-danger-fg" />,
        info: <Info aria-hidden="true" className="text-primary-700" />,
        success: <CircleCheckBig aria-hidden="true" className="text-student-status-success-fg" />,
        warning: <AlertTriangle aria-hidden="true" className="text-student-status-attention-fg" />,
      }}
      mobileOffset={{ top: "calc(16px + env(safe-area-inset-top, 0px))", left: 16, right: 16 }}
      offset={24}
      position="top-center"
      richColors={false}
      swipeDirections={["top", "left", "right"]}
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
