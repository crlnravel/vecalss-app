"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useRef } from "react";

import { showToast } from "@/components/ui/toast";
import { STUDIO_TOOLS, type StudioRequest } from "@/lib/vera/studio";

const RUN_FAILED = "Dokumen belum bisa disusun sekarang.";
// The server settles a stopped run's usage once it notices the cut stream, so a read right after the stop can miss that charge.
const SETTLE_AFTER_STOP_MS = 1_000;

/** The server sends a JSON body with a friendly message for refusals. Anything else gets the generic line. */
function runErrorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { message?: unknown };
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // Not a JSON body, so use the generic line.
  }
  return RUN_FAILED;
}

/**
 * One Studio run at a time. A run streams through the same message protocol as chat, so its tool rows show what Vera is reading
 * while the document is written. The last request is kept, so the retry in a failure toast can send it again. `onSettled` runs once
 * for each run that ends, whether it completed, was stopped or failed.
 */
export function useVeraStudioRun(onSettled: () => void) {
  const lastRequest = useRef<StudioRequest | null>(null);
  // The run is described entirely by the request body (tool, input and effort), so only that body is sent.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/vera/studio",
        prepareSendMessagesRequest: ({ body }) => ({ body: { ...body } }),
      }),
    [],
  );
  const { messages, sendMessage, status, stop } = useChat<UIMessage>({
    id: "vera-studio",
    transport,
    // The chat SDK calls onFinish once per run, including a stopped run and a failed one. A stop or a dropped connection is settled on
    // the server after the stream is cut, so the read waits for that.
    onFinish: ({ isAbort, isDisconnect }) => {
      if (isAbort || isDisconnect) window.setTimeout(onSettled, SETTLE_AFTER_STOP_MS);
      else onSettled();
    },
    onError: (error) => {
      showToast(runErrorMessage(error), {
        variant: "error",
        action: {
          label: "Coba lagi",
          onClick: () => {
            if (lastRequest.current) run(lastRequest.current);
          },
        },
      });
    },
  });

  function run(request: StudioRequest) {
    lastRequest.current = request;
    void sendMessage({ text: STUDIO_TOOLS[request.tool].label }, { body: request });
  }

  const preview = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  return {
    busy: status === "submitted" || status === "streaming",
    // The saved document's id comes back in the message metadata, so the preview can open that document or ask about it.
    previewDocumentId: (preview?.metadata as { documentId?: string } | undefined)?.documentId,
    preview,
    run,
    stop,
  };
}

export type VeraStudioRun = ReturnType<typeof useVeraStudioRun>;
