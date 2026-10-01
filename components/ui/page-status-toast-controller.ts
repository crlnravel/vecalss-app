import type { ToastVariant } from "./toast";

type PageStatusToastAction = {
  label: string;
  onClick: () => void;
};

type PageStatusToastInput = {
  active: boolean;
  message: string;
  description?: string;
  variant?: ToastVariant;
  action?: PageStatusToastAction;
  cancel?: PageStatusToastAction;
};

type PageStatusToastSinkOptions = {
  description?: string;
  variant: ToastVariant;
  duration: number;
  dismissible: boolean;
  closeButton: boolean;
  action?: PageStatusToastAction;
  cancel?: PageStatusToastAction;
};

type PageStatusToastSink = {
  show: (id: string, message: string, options: PageStatusToastSinkOptions) => void;
  dismiss: (id: string) => void;
};

type PageStatusToastSnapshot = {
  message: string;
  description?: string;
  variant: ToastVariant;
  actionLabel?: string;
  cancelLabel?: string;
};

let generatedId = 0;

function sameSnapshot(left: PageStatusToastSnapshot, right: PageStatusToastSnapshot) {
  return left.message === right.message
    && left.description === right.description
    && left.variant === right.variant
    && left.actionLabel === right.actionLabel
    && left.cancelLabel === right.cancelLabel;
}

function createPageStatusToastController(sink: PageStatusToastSink, id = `page-status-${++generatedId}`) {
  let current: PageStatusToastInput | undefined;
  let displayed: PageStatusToastSnapshot | undefined;
  let disposed = false;

  function resolve() {
    if (disposed) return;
    current = undefined;
    if (!displayed) return;
    displayed = undefined;
    sink.dismiss(id);
  }

  function update(input: PageStatusToastInput) {
    if (disposed) return;
    if (!input.active || input.message.trim().length === 0) {
      resolve();
      return;
    }

    current = input;
    const snapshot: PageStatusToastSnapshot = {
      message: input.message,
      description: input.description,
      variant: input.variant ?? "default",
      actionLabel: input.action?.label,
      cancelLabel: input.cancel?.label,
    };

    if (displayed && sameSnapshot(displayed, snapshot)) return;
    displayed = snapshot;
    sink.show(id, input.message, {
      description: input.description,
      variant: snapshot.variant,
      duration: Number.POSITIVE_INFINITY,
      dismissible: false,
      closeButton: false,
      action: input.action
        ? { label: input.action.label, onClick: () => current?.action?.onClick() }
        : undefined,
      cancel: input.cancel
        ? { label: input.cancel.label, onClick: () => current?.cancel?.onClick() }
        : undefined,
    });
  }

  function dispose() {
    if (disposed) return;
    resolve();
    disposed = true;
  }

  return { id, update, resolve, dispose };
}

export { createPageStatusToastController };
export type {
  PageStatusToastAction,
  PageStatusToastInput,
  PageStatusToastSink,
  PageStatusToastSinkOptions,
};
