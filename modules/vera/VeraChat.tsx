"use client";

import { isToolUIPart, type UIMessage } from "ai";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { ChatThread, ChatTurn } from "@/components/ai-elements/chat";
import type { PromptInputStatus } from "@/components/ai-elements/prompt-input";
import { Reasoning } from "@/components/ai-elements/reasoning";
import { Sources } from "@/components/ai-elements/sources";
import { ToolStep } from "@/components/ai-elements/tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Check, CircleHelp, Copy, FileText, Flag, MessageCircle, Pencil, RefreshCw } from "@/lib/icons";
import {
  VERA_LIMITS,
  VERA_REPORT_NOTE_LIMIT,
  VERA_REPORT_REASON_IDS,
  VERA_REPORT_REASON_LABELS,
  type VeraEffortId,
  type VeraReportReason,
} from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";
import { cn } from "@/lib/utils";
import { collectSources, uniqueSources, type ResolvedMention, type VeraSource } from "@/lib/vera/sources/types";
import { STUDIO_DOCUMENT_PART, STUDIO_REQUEST_PART, studioToolOfWrite } from "@/lib/vera/studio";
import { type MentionChip } from "@/modules/vera/mention-model";
import { VeraComposer } from "@/modules/vera/VeraComposer";
import { VeraMarkdown } from "@/modules/vera/VeraMarkdown";
import { VERA_STARTER_PROMPTS } from "@/modules/vera/vera-prompts";

const MASCOT_SRC = "/brand/mascot-vecalss-2.png";

/** The page sends an edit with the message's text, the message's stored id, and its mentions. */
type EditHandler = (storedId: string, localId: string, text: string, mentions: ResolvedMention[]) => void;
/** The page saves a report and says so. It resolves true once the report is saved, so the dialog can close. */
type ReportHandler = (messageId: string, reason: VeraReportReason, note: string) => Promise<boolean>;

/**
 * The chat view, in Aily's centre column: the thread scrolls inside the column, and the composer card stays pinned under it with the
 * disclaimer. The page owns the messages and the requests; this view only shows them and hands the student's actions back.
 */
export function VeraChat({
  blocked,
  busy,
  composerKey,
  deletedDocumentId,
  effort,
  initialChips,
  messages,
  onAskDocument,
  onChangeEffort,
  onEdit,
  onOpenDocument,
  onRegenerate,
  onReport,
  onSend,
  onStop,
  restoredIds,
  status,
  stoppedMessageId,
}: {
  blocked: string | null;
  busy: boolean;
  composerKey: number;
  deletedDocumentId: string | null;
  effort: VeraEffortId;
  initialChips: MentionChip[];
  messages: UIMessage[];
  restoredIds: Set<string>;
  status: PromptInputStatus;
  stoppedMessageId: string | null;
  onAskDocument: (id: string) => void;
  onChangeEffort: (effort: VeraEffortId) => void;
  onEdit: EditHandler;
  onOpenDocument: (id: string) => void;
  onRegenerate: (messageId: string) => void;
  onReport: ReportHandler;
  onSend: (text: string, chips: MentionChip[]) => void;
  onStop: () => void;
}) {
  // Edit and Ulangi act only on the newest message of their kind, and nothing of the three shows while a turn streams.
  const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {messages.length > 0 ? (
        <ChatThread className="mx-auto w-full max-w-3xl" contentClassName="flex flex-col gap-6 px-4 py-6">
          {messages.map((message, index) => {
            const storedId = message.role === "user" ? storedUserId(messages, index, restoredIds) : null;
            return (
              <ChatTurn fromUser={message.role === "user"} key={message.id} messageId={message.id}>
                <ThreadMessage
                  blocked={blocked}
                  canEdit={!busy && index === lastUserIndex && storedId !== null && !isStudioQuestion(message)}
                  canRegenerate={!busy && index === messages.length - 1 && message.role === "assistant"}
                  canReport={!busy && message.role === "assistant"}
                  deletedDocumentId={deletedDocumentId}
                  fresh={!restoredIds.has(message.id)}
                  message={message}
                  onAskDocument={onAskDocument}
                  onEdit={onEdit}
                  onOpenDocument={onOpenDocument}
                  onRegenerate={onRegenerate}
                  onReport={onReport}
                  storedId={storedId}
                  stopping={message.id === stoppedMessageId}
                  writing={busy && index === messages.length - 1}
                />
              </ChatTurn>
            );
          })}
        </ChatThread>
      ) : null}

      <div className="mx-auto flex w-full max-w-181 shrink-0 flex-col gap-3 px-4 pb-4 pt-3">
        {messages.length === 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {VERA_STARTER_PROMPTS.map((prompt) => (
              <Button
                className="h-11 rounded-pill"
                disabled={blocked !== null || busy}
                key={prompt}
                onClick={() => onSend(prompt, [])}
                type="button"
                variant="outline"
              >
                <CircleHelp />
                {prompt}
              </Button>
            ))}
          </div>
        ) : null}
        {blocked ? (
          <p
            className="rounded-card border border-student-status-attention-border bg-student-status-attention-bg px-4 py-3 text-sm text-student-status-attention-fg"
            id="vera-limit-notice"
            role="status"
          >
            {blocked}
          </p>
        ) : null}
        <VeraComposer
          blocked={blocked}
          effort={effort}
          initialChips={initialChips}
          key={composerKey}
          onEffortChange={onChangeEffort}
          onSend={({ text, chips }) => onSend(text, chips)}
          onStop={onStop}
          placeholder="Balas Vera"
          status={status}
        />
        <p className="text-center text-xs text-muted-foreground">Vera bisa salah. Cek lagi jawabannya.</p>
      </div>
    </div>
  );
}

/**
 * The id the server stores a student's message under. A message sent in this session is stored under the id its answer names. A message
 * restored from the server already has that id. A message with neither is not edited, because the server could not find it.
 */
function storedUserId(messages: UIMessage[], index: number, restoredIds: Set<string>): string | null {
  const answer = messages[index + 1];
  const named = (answer?.metadata as { userMessageId?: string } | undefined)?.userMessageId;
  if (named) return named;
  return restoredIds.has(messages[index].id) ? messages[index].id : null;
}

/** A Studio request's question. Its options are the request, so the question is not edited. */
function isStudioQuestion(message: UIMessage) {
  return (
    message.parts.some((part) => part.type === STUDIO_REQUEST_PART) ||
    (message.metadata as { studio?: unknown } | undefined)?.studio !== undefined
  );
}

type StudioPointer = { documentId: string; complete: boolean };

/**
 * The Studio document an answer was saved as. A stored answer keeps a pointer to it, and a live answer names it in its finish metadata.
 * `called` says the answer has called a Studio tool, so its document may still be on the way.
 */
function studioAnswerOf(message: UIMessage) {
  const pointer = message.parts.find((part) => part.type === STUDIO_DOCUMENT_PART);
  const pointed = pointer && "data" in pointer ? (pointer.data as StudioPointer) : undefined;
  const named = pointed ?? (message.metadata as { studio?: StudioPointer } | undefined)?.studio;
  return {
    documentId: named?.documentId ?? null,
    complete: named?.complete ?? false,
    called: message.parts.some((part) => isToolUIPart(part) && studioToolOfWrite(part.type.slice("tool-".length)) !== null),
  };
}

/**
 * The `@` sources a student pinned. The chips wrap inside the message and a long label ends in an ellipsis. A source the server could
 * not open says so instead of linking.
 */
function MentionLinks({ mentions }: { mentions: ResolvedMention[] }) {
  return (
    <div className="flex max-w-full min-w-0 flex-wrap justify-end gap-2">
      {mentions.map((mention) =>
        mention.status === "accepted" && mention.source ? (
          <Link className="min-w-0 max-w-full" href={mention.source.href} key={`${mention.type}:${mention.id}`}>
            <Badge className="max-w-full min-w-0 shrink" size="sm" tone="info">
              <span className="min-w-0 truncate">{mention.label}</span>
            </Badge>
          </Link>
        ) : (
          <Badge className="max-w-full min-w-0 shrink" key={`${mention.type}:${mention.id}`} size="sm" tone="attention">
            <span className="min-w-0 truncate">{`${mention.label}: tidak bisa dibuka`}</span>
          </Badge>
        ),
      )}
    </div>
  );
}

/** Copies the answer's text. The icon turns into a check for two seconds, and the button keeps its name, "Salin". */
function CopyAnswerButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      aria-label="Salin"
      className="-my-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2_000);
        } catch {
          // The browser refused the copy, so the icon stays as it is.
        }
      }}
      size="icon"
      type="button"
      variant="quiet"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

/** The student's question open for editing, in place. Kirim sends the new text, and the server replaces the question and the answer after it. */
function EditQuestion({
  blocked,
  initial,
  onCancel,
  onSubmit,
}: {
  blocked: boolean;
  initial: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const text = draft.trim();
  return (
    <div className="flex w-full max-w-[70%] flex-col gap-2">
      <Textarea
        aria-label="Ubah pertanyaan"
        className="min-h-20 rounded-panel bg-white text-base"
        maxLength={VERA_LIMITS.maxMessageChars}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        ref={(node) => node?.focus()}
        value={draft}
      />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="outline">
          Batal
        </Button>
        <Button disabled={text.length === 0 || blocked} onClick={() => onSubmit(text)} size="sm" type="button">
          Kirim
        </Button>
      </div>
    </div>
  );
}

/** Laporkan: the student picks a reason and may add a note. The report is saved for this one answer. */
function ReportDialog({
  onClose,
  onSubmit,
  open,
}: {
  onClose: () => void;
  onSubmit: (reason: VeraReportReason, note: string) => Promise<boolean>;
  open: boolean;
}) {
  const [reason, setReason] = useState<VeraReportReason | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  function close() {
    setReason(null);
    setNote("");
    onClose();
  }

  async function send() {
    if (!reason || sending) return;
    setSending(true);
    const saved = await onSubmit(reason, note.trim());
    setSending(false);
    if (saved) close();
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) close();
      }}
      open={open}
    >
      <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-[32rem] flex-col gap-5 rounded-panel p-5 sm:max-w-[32rem] sm:p-6">
        <DialogHeader>
          <DialogTitle>Laporkan jawaban</DialogTitle>
          <DialogDescription>Pilih alasannya. Catatan tambahan boleh dikosongkan.</DialogDescription>
        </DialogHeader>
        <div aria-label="Alasan laporan" className="flex flex-wrap gap-2" role="group">
          {VERA_REPORT_REASON_IDS.map((id) => (
            <Button
              aria-pressed={reason === id}
              className="rounded-pill"
              key={id}
              onClick={() => setReason(id)}
              size="sm"
              type="button"
              variant={reason === id ? "default" : "outline"}
            >
              {VERA_REPORT_REASON_LABELS[id]}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Catatan"
            maxLength={VERA_REPORT_NOTE_LIMIT}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Tulis catatan jika perlu"
            value={note}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {note.length}/{VERA_REPORT_NOTE_LIMIT}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={close} type="button" variant="outline">
            Batal
          </Button>
          <Button disabled={!reason || sending} onClick={() => void send()} type="button">
            Kirim laporan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ThreadMessage({
  blocked,
  canEdit,
  canRegenerate,
  canReport,
  deletedDocumentId,
  fresh = false,
  message,
  onAskDocument,
  onEdit,
  onOpenDocument,
  onRegenerate,
  onReport,
  storedId,
  stopping = false,
  writing = false,
}: {
  blocked: string | null;
  canEdit: boolean;
  canRegenerate: boolean;
  canReport: boolean;
  deletedDocumentId: string | null;
  fresh?: boolean;
  message: UIMessage;
  onAskDocument: (id: string) => void;
  onEdit: EditHandler;
  onOpenDocument: (id: string) => void;
  onRegenerate: (messageId: string) => void;
  onReport: ReportHandler;
  storedId: string | null;
  stopping?: boolean;
  writing?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  // A turn that arrives during the session eases in. Under reduced motion it appears at once.
  const enter = fresh
    ? "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"
    : undefined;

  if (message.role === "user") {
    const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
    const mentions = (message.metadata as { mentions?: ResolvedMention[] } | undefined)?.mentions ?? [];
    // The editor opens only while this question can still be edited, and it sends the id the server stores the question under.
    const editId = canEdit ? storedId : null;
    const showEditor = editing && editId !== null;
    return (
      <div className={cn("flex flex-col items-end gap-2", enter)}>
        {showEditor ? (
          <EditQuestion
            blocked={blocked !== null}
            initial={text}
            onCancel={() => setEditing(false)}
            onSubmit={(next) => {
              setEditing(false);
              onEdit(editId, message.id, next, mentions);
            }}
          />
        ) : (
          <div className="max-w-[70%] rounded-pill bg-accent px-5 py-2.5 text-base leading-[1.6] whitespace-pre-wrap text-voyage-deep">
            {text}
          </div>
        )}
        {editId !== null && !showEditor ? (
          <Button onClick={() => setEditing(true)} size="sm" type="button" variant="quiet">
            <Pencil />
            Edit
          </Button>
        ) : null}
        {mentions.length > 0 ? <MentionLinks mentions={mentions} /> : null}
      </div>
    );
  }

  const stopped =
    stopping ||
    message.parts.some(
      (part) => part.type === "data-vera-status" && (part.data as { stopped?: boolean } | undefined)?.stopped === true,
    );
  const credits = (message.metadata as { credits?: number } | undefined)?.credits;
  // Links come from the pinned sources the server accepted and from the tool results the answer used. Both only point at pages
  // the student could open.
  const pinnedSources = (message.metadata as { sources?: VeraSource[] } | undefined)?.sources ?? [];
  const toolOutputs = message.parts.flatMap((part) => (isToolUIPart(part) ? [part.output] : []));
  const sources = uniqueSources([...pinnedSources, ...collectSources(toolOutputs)]);
  const answer = message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
  const studio = studioAnswerOf(message);
  // The document's buttons need its text, and they stop once the student has deleted the document.
  const documentId = studio.documentId && answer ? studio.documentId : null;
  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-2", enter)}>
      <span aria-hidden="true" className="relative size-8 shrink-0 overflow-hidden">
        <Image alt="" className="object-contain" fill sizes="32px" src={MASCOT_SRC} />
      </span>
      <div className="relative flex w-full min-w-0 flex-col gap-3 rounded-panel border border-border bg-white p-4 text-base leading-[1.7] text-foreground">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -top-3 left-2 h-3 w-4 overflow-visible fill-white stroke-border stroke-1"
          viewBox="0 0 16 12"
        >
          <path d="M0 0 L6 12 L16 12 Z" />
        </svg>
        {documentId ? (
          <Badge className="self-start" size="sm" tone={studio.complete ? "success" : "attention"}>
            {studio.complete ? "Tersimpan" : "Belum selesai"}
          </Badge>
        ) : studio.called && writing ? (
          <Badge className="self-start" size="sm" tone="info">
            Menyusun dokumen…
          </Badge>
        ) : null}
        {message.parts.map((part, index) => {
          if (part.type === "reasoning") {
            return <Reasoning key={index} streaming={part.state === "streaming"} text={part.text} />;
          }
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
              <VeraMarkdown className="max-w-[70ch]" key={index}>
                {part.text}
              </VeraMarkdown>
            );
          }
          return null;
        })}
        {stopped ? <p className="text-xs text-muted-foreground">Jawaban dihentikan.</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted-foreground">
        {answer ? <CopyAnswerButton text={answer} /> : null}
        {canRegenerate ? (
          <Button
            aria-describedby={blocked ? "vera-limit-notice" : undefined}
            disabled={blocked !== null}
            onClick={() => onRegenerate(message.id)}
            size="sm"
            title={blocked ?? undefined}
            type="button"
            variant="quiet"
          >
            <RefreshCw />
            Ulangi
          </Button>
        ) : null}
        {canReport ? (
          <Button onClick={() => setReporting(true)} size="sm" type="button" variant="quiet">
            <Flag />
            Laporkan
          </Button>
        ) : null}
        {documentId && documentId !== deletedDocumentId ? (
          <>
            <Button onClick={() => onOpenDocument(documentId)} size="sm" type="button" variant="quiet">
              <FileText />
              Buka dokumen
            </Button>
            <Button onClick={() => onAskDocument(documentId)} size="sm" type="button" variant="quiet">
              <MessageCircle />
              Tanya Vera soal ini
            </Button>
          </>
        ) : null}
        <Sources sources={sources} />
        {typeof credits === "number" ? <span className="tabular-nums">{formatCredits(credits)} kredit</span> : null}
      </div>
      {canReport ? (
        <ReportDialog
          onClose={() => setReporting(false)}
          onSubmit={(reason, note) => onReport(message.id, reason, note)}
          open={reporting}
        />
      ) : null}
    </div>
  );
}
