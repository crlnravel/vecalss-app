import "server-only";

import {
  VeraAdmissionError,
  VeraAdmissionService,
  type VeraAdmissionInput,
  type VeraAdmissionResponse,
  type VeraRequestStatusDto,
} from "./admission";
import { inertVeraDelta } from "./output-validator";

export type VeraSseEventName =
  | "request.started"
  | "progress.updated"
  | "artifact.ready"
  | "message.delta"
  | "message.generated"
  | "message.committed"
  | "request.completed"
  | "request.recovery_pending"
  | "request.failed";

export type VeraSseEvent = {
  id: number;
  event: VeraSseEventName;
  data: Record<string, unknown>;
};

export type VeraChatPostResult =
  | { kind: "stream"; requestId: string; events: VeraSseEvent[]; status: VeraRequestStatusDto }
  | { kind: "json"; status: VeraRequestStatusDto };

export type VeraChatOrchestratorOptions = {
  assertConversationOwner?: (studentId: string, conversationId: string) => Promise<void>;
};

/**
 * One server command boundary for Chat. Routes only parse/authenticate and
 * select JSON versus SSE; this class owns replay-first orchestration and
 * delegates quota/stage/finalization to VeraAdmissionService.
 */
export class VeraChatOrchestrator {
  constructor(
    private readonly admission: VeraAdmissionService,
    private readonly options: VeraChatOrchestratorOptions = {},
  ) {}

  async post(input: VeraAdmissionInput & { signal?: AbortSignal }): Promise<VeraChatPostResult> {
    await this.options.assertConversationOwner?.(input.studentId, input.conversationId);
    let admitted: VeraAdmissionResponse;
    try {
      admitted = await this.admission.admit(input);
    } catch (error) {
      if (error instanceof VeraAdmissionError) throw error;
      throw new VeraAdmissionError({ code: "admission_unavailable", status: 503 });
    }

    if (admitted.kind === "replay") return { kind: "json", status: admitted.request };
    if (admitted.kind === "rejected") return { kind: "json", status: admitted.status };

    const events: VeraSseEvent[] = [];
    let sequence = 0;
    const push = (event: VeraSseEventName, data: Record<string, unknown>) => {
      events.push({ id: ++sequence, event, data });
    };
    push("request.started", {
      requestId: admitted.request.id,
      clientRequestId: admitted.request.clientRequestId,
      provisional: true,
    });

    if (input.signal?.aborted) {
      await this.admission.settleOverdueRequest({ requestId: admitted.request.id, now: input.now, forceUnknown: true, errorCode: "cancelled" });
      push("request.failed", { requestId: admitted.request.id, code: "cancelled", provisional: false });
      return { kind: "stream", requestId: admitted.request.id, events, status: await this.requireStatus(input.studentId, input.conversationId, input.clientRequestId) };
    }

    try {
      const status = await this.admission.runAccepted({
        requestId: admitted.request.id,
        now: input.now,
        emit: (delta) => push("message.delta", {
          requestId: admitted.request.id,
          text: inertVeraDelta(delta),
          provisional: true,
        }),
      });
      if (status.state === "succeeded" || status.state === "fallback") {
        push("message.generated", {
          requestId: admitted.request.id,
          text: status.result?.text ?? null,
          citationKeys: status.result?.citationKeys ?? [],
          provisional: true,
        });
        push("message.committed", {
          requestId: admitted.request.id,
          assistantMessageId: this.admission.requests.get(admitted.request.id)?.assistantMessageId ?? null,
          provisional: false,
        });
        push("request.completed", {
          requestId: admitted.request.id,
          state: status.state,
          usage: status.usage,
        });
      } else {
        push(status.errorCode === "missing_stage_unknown" ? "request.recovery_pending" : "request.failed", {
          requestId: admitted.request.id,
          code: status.errorCode ?? "request_failed",
          provisional: false,
        });
      }
      return { kind: "stream", requestId: admitted.request.id, events, status };
    } catch (error) {
      const code = error instanceof VeraAdmissionError ? error.code : "finalization_unavailable";
      const status = await this.admission.settleOverdueRequest({
        requestId: admitted.request.id,
        now: input.now,
        forceUnknown: true,
        errorCode: code,
      }).then(() => this.requireStatus(input.studentId, input.conversationId, input.clientRequestId));
      push("request.recovery_pending", { requestId: admitted.request.id, code, provisional: false });
      return { kind: "stream", requestId: admitted.request.id, events, status };
    }
  }

  async status(input: { studentId: string; conversationId: string; clientRequestId: string; now?: Date }): Promise<VeraRequestStatusDto | null> {
    await this.options.assertConversationOwner?.(input.studentId, input.conversationId);
    return this.admission.status(input);
  }

  usage(studentId: string, now?: Date) {
    return this.admission.usage(studentId, now);
  }

  async cancel(input: { studentId: string; conversationId: string; clientRequestId: string; now?: Date }): Promise<VeraRequestStatusDto | null> {
    const status = await this.status(input);
    if (!status || !status.requestId) return status;
    await this.admission.settleOverdueRequest({ requestId: status.requestId, now: input.now, forceUnknown: true, errorCode: "cancelled" });
    return this.status(input);
  }

  async sse(input: VeraAdmissionInput & { signal?: AbortSignal }): Promise<Response> {
    await this.options.assertConversationOwner?.(input.studentId, input.conversationId);
    let admitted: VeraAdmissionResponse;
    try {
      admitted = await this.admission.admit(input);
    } catch (error) {
      if (error instanceof VeraAdmissionError) throw error;
      throw new VeraAdmissionError({ code: "admission_unavailable", status: 503 });
    }
    if (admitted.kind === "replay" || admitted.kind === "rejected") {
      return Response.json(admitted.kind === "replay" ? admitted.request : admitted.status, {
        status: admitted.kind === "rejected" ? 409 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    let sequence = 0;
    let readerCancelled = false;
    let signalAborted = input.signal?.aborted ?? false;
    let cancellationRecorded = false;
    const controllerRef: { current: ReadableStreamDefaultController<Uint8Array> | null } = { current: null };
    const recordCancellation = async (code = "cancelled") => {
      if (cancellationRecorded) return;
      cancellationRecorded = true;
      await this.admission.settleOverdueRequest({ requestId: admitted.request.id, now: input.now, forceUnknown: true, errorCode: code }).catch(() => undefined);
    };
    const onAbort = () => {
      signalAborted = true;
      void recordCancellation();
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    const push = (event: VeraSseEventName, data: Record<string, unknown>) => {
      if (readerCancelled || !controllerRef.current) return;
      controllerRef.current.enqueue(new TextEncoder().encode(`id: ${++sequence}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    };
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controllerRef.current = controller;
        push("request.started", { requestId: admitted.request.id, clientRequestId: input.clientRequestId, provisional: true });
        void (async () => {
          if (signalAborted) {
            await recordCancellation();
            push("request.failed", { requestId: admitted.request.id, code: "cancelled", provisional: false });
            return;
          }
          try {
            const status = await this.admission.runAccepted({
              requestId: admitted.request.id,
              now: input.now,
              emit: (delta) => {
                if (!signalAborted) push("message.delta", {
                  requestId: admitted.request.id,
                  text: inertVeraDelta(delta),
                  provisional: true,
                });
              },
            });
            if (status.state === "succeeded" || status.state === "fallback") {
              push("message.generated", {
                requestId: admitted.request.id,
                text: status.result?.text ?? null,
                citationKeys: status.result?.citationKeys ?? [],
                provisional: true,
              });
              push("message.committed", {
                requestId: admitted.request.id,
                assistantMessageId: this.admission.requests.get(admitted.request.id)?.assistantMessageId ?? null,
                provisional: false,
              });
              push("request.completed", { requestId: admitted.request.id, state: status.state, usage: status.usage });
            } else {
              push(status.errorCode === "missing_stage_unknown" ? "request.recovery_pending" : "request.failed", {
                requestId: admitted.request.id,
                code: status.errorCode ?? "request_failed",
                provisional: false,
              });
            }
          } catch (error) {
            const code = error instanceof VeraAdmissionError ? error.code : "finalization_unavailable";
            await recordCancellation(code);
            push("request.recovery_pending", { requestId: admitted.request.id, code, provisional: false });
          }
        })().finally(() => {
          input.signal?.removeEventListener("abort", onAbort);
          if (!readerCancelled) controller.close();
        });
      },
      cancel: async () => {
        readerCancelled = true;
        await recordCancellation();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  }

  private async requireStatus(studentId: string, conversationId: string, clientRequestId: string): Promise<VeraRequestStatusDto> {
    const status = await this.admission.status({ studentId, conversationId, clientRequestId });
    if (!status) throw new VeraAdmissionError({ code: "request_not_found", status: 404 });
    return status;
  }
}

export function encodeVeraSse(events: VeraSseEvent[]): string {
  return events.map((event) => `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
}
