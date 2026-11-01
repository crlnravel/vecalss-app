"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { ToolStep } from "@/components/ai-elements/tool";
import { estimateCreditRange, formatCreditRange, type VeraPrices } from "@/lib/vera/credits-shared";
import { STUDIO_TOOLS, type StudioRequest } from "@/lib/vera/studio";
import type { StudioDocument, StudioDocumentSummary } from "@/lib/vera/studio-documents";
import { cn } from "@/lib/utils";
import { useVeraStudioDocs } from "@/modules/vera/use-vera-studio";
import { VeraStudioDocCards, VeraStudioDocDialog } from "@/modules/vera/VeraStudioDocs";
import { VeraStudioTools } from "@/modules/vera/VeraStudioTools";

const RUN_FAILED = "Dokumen belum bisa disusun sekarang. Coba lagi.";

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
  // The run is described entirely by the request body (tool, input and effort), so only that body is sent.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/vera/studio",
        prepareSendMessagesRequest: ({ body }) => ({ body: { ...body } }),
      }),
    [],
  );
  const { messages, sendMessage, status, stop, error } = useChat<UIMessage>({
    id: "vera-studio",
    transport,
    onFinish: () => {
      void docs.refresh();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const estimate = formatCreditRange(estimateCreditRange({ effort: "mendalam", historyChars: 0, mentionCount: 0 }, prices));
  const preview = [...messages].reverse().find((message) => message.role === "assistant") ?? null;

  function run(request: StudioRequest) {
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
        <section aria-label="Pratinjau dokumen" className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-xs text-muted-foreground" role="status">
            {busy ? "Vera sedang menyusun dokumen…" : "Dokumen selesai. Lihat di daftar di bawah."}
          </p>
          <div className="space-y-3 text-sm leading-relaxed">
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
                return (
                  <div className="min-w-0 break-words" key={index}>
                    <ReactMarkdown
                      rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}
                      remarkPlugins={[remarkGfm, remarkMath]}
                    >
                      {part.text}
                    </ReactMarkdown>
                  </div>
                );
              }
              return null;
            })}
          </div>
          {busy ? (
            <button className={cn("mt-3 text-xs text-muted-foreground underline")} onClick={() => void stop()} type="button">
              Hentikan
            </button>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {runErrorMessage(error)}
        </p>
      ) : null}

      <section aria-labelledby="vera-studio-docs" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary-950" id="vera-studio-docs">
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
