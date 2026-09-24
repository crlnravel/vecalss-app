"use client";

import { useEffect, useRef } from "react";

import { showToast } from "./toast";

type ActionToastState = {
  fieldErrors?: Record<string, string | undefined>;
  message?: string;
  status: "error" | "idle" | "success";
};

function useActionToast(state: ActionToastState) {
  const lastToastedStateRef = useRef<ActionToastState | null>(null);
  const keepMessageInline =
    state.status === "error" &&
    Object.values(state.fieldErrors ?? {}).some(Boolean);

  useEffect(() => {
    if (state.status === "idle" || !state.message || keepMessageInline) {
      return;
    }
    if (lastToastedStateRef.current === state) return;

    lastToastedStateRef.current = state;
    showToast(state.message, {
      variant: state.status === "success" ? "success" : "error",
    });
  }, [keepMessageInline, state]);

  return keepMessageInline;
}

export { useActionToast };
