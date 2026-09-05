"use server";

import { revalidatePath } from "next/cache";

import { requireStudentSession } from "@/lib/auth/access";
import {
  attemptState,
  reconcileTryoutDisconnect,
  recordTryoutIntegrityEvent,
  saveTryoutAnswer,
  sealTryoutTestRun,
  startActiveTestRun,
  startTryoutAttempt,
  startTryoutDisconnect,
  TryoutAttemptValidationError,
} from "@/lib/tryout/attempt-repository";
import type { TryoutIntegrityEventType } from "@/generated/prisma/client";
import { requireTryoutCapability, TryoutCapabilityError } from "@/lib/tryout/capabilities";
import { registerForTryout, TryoutDeliveryValidationError } from "@/lib/tryout/delivery-repository";
import { participantTryoutResult, TryoutResultValidationError } from "@/lib/tryout/result-repository";

function message(error: unknown) {
  return error instanceof TryoutAttemptValidationError || error instanceof TryoutDeliveryValidationError || error instanceof TryoutCapabilityError || error instanceof TryoutResultValidationError
    ? error.message
    : "Tryout tidak dapat diproses saat ini. Silakan coba lagi.";
}

async function participantSession() {
  const session = await requireStudentSession();
  requireTryoutCapability(session, "tryout.attempt.execute");
  return session;
}

async function registerForTryoutAction(
  tryoutId: string,
  selectedSessionId?: string | null,
) {
  const session = await requireStudentSession();
  try {
    requireTryoutCapability(session, "tryout.admission.register");
    const result = await registerForTryout(tryoutId, session.user.id, undefined, selectedSessionId);
    revalidatePath("/tryout");
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function registerForTryoutWithTargetAction(
  tryoutId: string,
  target: { majorId: string; universityId: string },
  selectedSessionId?: string | null,
) {
  const session = await requireStudentSession();
  try {
    requireTryoutCapability(session, "tryout.admission.register");
    const result = await registerForTryout(tryoutId, session.user.id, target, selectedSessionId);
    revalidatePath("/tryout");
    revalidatePath(`/tryout/${tryoutId}`);
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function startTryoutAttemptAction(deliverySessionId: string) {
  const session = await participantSession();
  try {
    const result = await startTryoutAttempt(deliverySessionId, session.user.id);
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function tryoutAttemptStateAction(attemptId: string) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await attemptState(attemptId, session.user.id) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function startActiveTryoutTestRunAction(attemptId: string, runId: string) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await startActiveTestRun(attemptId, runId, session.user.id) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function startTryoutDisconnectAction(attemptId: string, runId: string, reason: string) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await startTryoutDisconnect(attemptId, runId, session.user.id, reason) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function reconcileTryoutDisconnectAction(attemptId: string, runId: string, reason: string) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await reconcileTryoutDisconnect(attemptId, runId, session.user.id, reason) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function saveTryoutAnswerAction(attemptId: string, runId: string, itemId: string, optionId: string | null) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await saveTryoutAnswer(attemptId, runId, itemId, optionId, session.user.id) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function sealTryoutTestRunAction(attemptId: string, runId: string) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await sealTryoutTestRun(attemptId, runId, session.user.id) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function recordTryoutIntegrityEventAction(attemptId: string, runId: string, eventType: TryoutIntegrityEventType) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await recordTryoutIntegrityEvent(attemptId, runId, eventType, session.user.id) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

async function participantTryoutResultAction(attemptId: string) {
  const session = await participantSession();
  try {
    return { ok: true as const, result: await participantTryoutResult(attemptId, session.user.id) };
  } catch (error) {
    return { ok: false as const, message: message(error) };
  }
}

export {
  registerForTryoutAction,
  registerForTryoutWithTargetAction,
  recordTryoutIntegrityEventAction,
  participantTryoutResultAction,
  saveTryoutAnswerAction,
  reconcileTryoutDisconnectAction,
  sealTryoutTestRunAction,
  startActiveTryoutTestRunAction,
  startTryoutDisconnectAction,
  startTryoutAttemptAction,
  tryoutAttemptStateAction,
};
