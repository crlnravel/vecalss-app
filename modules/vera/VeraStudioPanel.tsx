"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useMemo, useRef, useState } from "react";

import { ToolStep } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { estimateCreditRange, formatCreditRange, type VeraPrices } from "@/lib/vera/credits-shared";
import { STUDIO_TOOLS, type StudioRequest } from "@/lib/vera/studio";
import type { StudioDocument, StudioDocumentSummary } from "@/lib/vera/studio-documents";
import { useVeraStudioDocs } from "@/modules/vera/use-vera-studio";
import { VeraMarkdown } from "@/modules/vera/VeraMarkdown";
import { VeraStudioDocCards, VeraStudioDocDialog } from "@/modules/vera/VeraStudioDocs";
import { VeraStudioTools } from "@/modules/vera/VeraStudioTools";

const RUN_FAILED = "Dokumen belum bisa disusun sekarang.";

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
 * The Studio tab: three tools, the live preview of the document being written, and the saved documents. Each run streams through the
 * same message protocol as chat, so the tool rows show what Vera is reading while the document is written.
 */
export function VeraStudioPanel({
  prices,
  initialDocuments,
  initialDocument,
  onAsk,
}: {
  prices: VeraPrices;
  initialDocuments: StudioDocumentSummary[];
  initialDocument: StudioDocument | null;
  onAsk: (doc: StudioDocument) => void;
}) {
  const docs = useVeraStudioDocs(initialDocuments);
  const [openDoc, setOpenDoc] = useState<StudioDocument | null>(initialDocument);
  // The last request is kept, so the retry in a failure toast can send it again.
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
    onFinish: () => {
      void docs.refresh();
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

  const busy = status === "submitted" || status === "streaming";
  const estimate = formatCreditRange(estimateCreditRange({ effort: "mendalam", historyChars: 0, mentionCount: 0 }, prices));
  const preview = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  // The run names its document in the start metadata, so the status line can tell whether the list holds that document.
  const previewDocumentId = (preview?.metadata as { documentId?: string } | undefined)?.documentId;
  const previewSaved = docs.documents.some((doc) => doc.id === previewDocumentId);

  function run(request: StudioRequest) {
    lastRequest.current = request;
    void sendMessage({ text: STUDIO_TOOLS[request.tool].label }, { body: request });
  }

  async function openDocument(id: string) {
    const response = await fetch(`/api/vera/studio/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const { document } = (await response.json()) as { document: StudioDocument };
    setOpenDoc(document);
  }

  async function deleteDocument(id: string) {
    setOpenDoc(null);
    await docs.remove(id);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <VeraStudioTools busy={busy} estimate={estimate} onRun={run} />

      {preview || busy ? (
        <section
          aria-label="Pratinjau dokumen"
          className="rounded-card border border-primary-100 bg-white p-5 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)]"
        >
          <p className="mb-3 text-xs text-muted-foreground" role="status">
            {busy ? "Vera sedang menyusun dokumen…" : previewSaved ? "Dokumen tersimpan. Lihat di daftar di bawah." : null}
          </p>
          <div className="max-w-[68ch] space-y-3 text-base leading-[1.7]">
            {(preview?.parts ?? []).map((part, index) => {
              if (isToolUIPart(part)) {
                return (
                  <ToolStep
                    key={index}
                    output={part.output}
                    state={part.state}
                    toolName={part.type.slice("tool-".length)}
                  />
                );
              }
              if (part.type === "text") {
                return <VeraMarkdown key={index}>{part.text}</VeraMarkdown>;
              }
              return null;
            })}
          </div>
          {busy ? (
            <Button className="mt-4" onClick={() => void stop()} size="sm" type="button" variant="outline">
              Hentikan
            </Button>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="vera-studio-docs" className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-extrabold tracking-[-0.02em] text-voyage-ink" id="vera-studio-docs">
          Dokumen
        </h2>
        {docs.error ? (
          <p className="text-sm text-muted-foreground" role="alert">
            {docs.error}
          </p>
        ) : null}
        <VeraStudioDocCards documents={docs.documents} onOpen={(id) => void openDocument(id)} />
      </section>

      <VeraStudioDocDialog
        doc={openDoc}
        onAsk={onAsk}
        onClose={() => setOpenDoc(null)}
        onDelete={(id) => void deleteDocument(id)}
      />
    </div>
  );
}
