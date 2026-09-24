"use client";

import { useEffect, useRef } from "react";

import { showToast, type ToastVariant } from "./toast";

function ToastOnMount({
  message,
  variant,
}: {
  message: string;
  variant: ToastVariant;
}) {
  const lastToastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!message) {
      lastToastKey.current = null;
      return;
    }

    const toastKey = `${variant}:${message}`;
    if (lastToastKey.current === toastKey) {
      return;
    }

    lastToastKey.current = toastKey;
    showToast(message, { variant });
  }, [message, variant]);

  return null;
}

export { ToastOnMount };
