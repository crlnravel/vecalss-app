"use client";

import { createElement, useEffect, useId, useRef } from "react";

import { Button } from "./button";
import { toast, showToast } from "./toast";
import {
  createPageStatusToastController,
  type PageStatusToastInput,
  type PageStatusToastSink,
} from "./page-status-toast-controller";

const pageStatusToastSink: PageStatusToastSink = {
  show(id, message, options) {
    const { action, cancel, ...toastOptions } = options;
    showToast(message, {
      ...toastOptions,
      id,
      placement: "action",
      action: action
        ? createElement(
            Button,
            { onClick: action.onClick, size: "default", type: "button", variant: "default" },
            action.label,
          )
        : undefined,
      cancel: cancel
        ? createElement(
            Button,
            { onClick: cancel.onClick, size: "default", type: "button", variant: "outline" },
            cancel.label,
          )
        : undefined,
    });
  },
  dismiss(id) {
    toast.dismiss(id);
  },
};

function usePageStatusToast(input: PageStatusToastInput) {
  const reactId = useId();
  const id = `page-status-${reactId}`;
  const controller = useRef<ReturnType<typeof createPageStatusToastController> | null>(null);

  useEffect(() => {
    const owner = createPageStatusToastController(pageStatusToastSink, id);
    controller.current = owner;

    return () => {
      owner.dispose();
      if (controller.current === owner) controller.current = null;
    };
  }, [id]);

  useEffect(() => {
    controller.current?.update(input);
  });
}

export { usePageStatusToast };
export type { PageStatusToastAction, PageStatusToastInput } from "./page-status-toast-controller";
