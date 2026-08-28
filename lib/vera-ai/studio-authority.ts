import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { canonicalJson, sha256Hex, type VeraContextSelection } from "./contracts";
import {
  lockAndRevalidateDrillCandidates,
  prepareFrozenDrillAuthority,
  type FrozenDrillAuthority,
} from "./drill-candidates";

export type VeraStudioQuestionAuthority = {
  questionId: string;
  questionRevisionId: string;
  topicId: string;
};

export type VeraStudioIdentityAuthority = {
  version: "vera-studio-authority-v1";
  studentId: string;
  sourceIds: string[];
  topicIds: string[];
  moduleIds: string[];
  questions: VeraStudioQuestionAuthority[];
  universityIds: string[];
  majorIds: string[];
  digest: string;
};

type AuthoritySeed = Omit<VeraStudioIdentityAuthority, "digest">;

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function withDigest(seed: AuthoritySeed): VeraStudioIdentityAuthority {
  return { ...seed, digest: sha256Hex(canonicalJson(seed)) };
}

export function assertStudioIdentityAuthority(value: unknown, studentId?: string): VeraStudioIdentityAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("studio_authority_missing");
  const candidate = value as Partial<VeraStudioIdentityAuthority>;
  if (candidate.version !== "vera-studio-authority-v1" || typeof candidate.studentId !== "string"
    || (studentId && candidate.studentId !== studentId) || typeof candidate.digest !== "string"
    || !Array.isArray(candidate.sourceIds) || !Array.isArray(candidate.topicIds) || !Array.isArray(candidate.moduleIds)
    || !Array.isArray(candidate.questions) || !Array.isArray(candidate.universityIds) || !Array.isArray(candidate.majorIds)) {
    throw new Error("studio_authority_invalid");
  }
  const seed: AuthoritySeed = {
    version: "vera-studio-authority-v1",
    studentId: candidate.studentId,
    sourceIds: sortedUnique(candidate.sourceIds.filter((id): id is string => typeof id === "string")),
    topicIds: sortedUnique(candidate.topicIds.filter((id): id is string => typeof id === "string")),
    moduleIds: sortedUnique(candidate.moduleIds.filter((id): id is string => typeof id === "string")),
    questions: candidate.questions.flatMap((entry) => entry && typeof entry === "object"
      && typeof entry.questionId === "string" && typeof entry.questionRevisionId === "string" && typeof entry.topicId === "string"
      ? [{ questionId: entry.questionId, questionRevisionId: entry.questionRevisionId, topicId: entry.topicId }]
      : []).sort((left, right) => left.questionRevisionId.localeCompare(right.questionRevisionId)),
    universityIds: sortedUnique(candidate.universityIds.filter((id): id is string => typeof id === "string")),
    majorIds: sortedUnique(candidate.majorIds.filter((id): id is string => typeof id === "string")),
  };
  const normalized = withDigest(seed);
  if (normalized.digest !== candidate.digest) throw new Error("studio_authority_digest_mismatch");
  return normalized;
}

async function buildAuthority(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    selection: VeraContextSelection[];
    drillAuthority: FrozenDrillAuthority | null;
    lock: boolean;
  },
): Promise<VeraStudioIdentityAuthority> {
  const materialIds = sortedUnique(input.selection.filter((source) => source.sourceType === "material").map((source) => source.sourceId));
  const practiceIds = sortedUnique(input.selection.filter((source) => source.sourceType === "practice").map((source) => source.sourceId));
  if (input.selection.some((source) => source.sourceType === "document")) throw new Error("studio_authority_unavailable");
  const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = clock[0]?.now;
  if (!(now instanceof Date)) throw new Error("studio_authority_unavailable");

  if (input.lock && materialIds.length) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM modules WHERE id IN (${Prisma.join(materialIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  }
  const modules = materialIds.length ? await tx.module.findMany({
    where: { id: { in: materialIds }, status: "published", publishedAt: { lte: now } },
    select: { id: true, topicId: true },
    orderBy: { id: "asc" },
  }) : [];
  if (modules.length !== materialIds.length) throw new Error("studio_authority_unavailable");

  let questions: VeraStudioQuestionAuthority[] = [];
  if (practiceIds.length) {
    if (!input.drillAuthority) throw new Error("studio_authority_unavailable");
    const coveredSources = sortedUnique(input.drillAuthority.candidates.map((candidate) => candidate.attemptId));
    if (canonicalJson(coveredSources) !== canonicalJson(practiceIds)) throw new Error("studio_authority_unavailable");
    const candidates = input.lock
      ? [...(await lockAndRevalidateDrillCandidates(tx, input.studentId, input.drillAuthority)).values()]
      : input.drillAuthority.candidates;
    if (candidates.length !== input.drillAuthority.candidates.length) throw new Error("studio_authority_drift");
    questions = candidates.map((candidate) => ({
      questionId: candidate.questionId,
      questionRevisionId: candidate.questionRevisionId,
      topicId: candidate.topicId,
    })).sort((left, right) => left.questionRevisionId.localeCompare(right.questionRevisionId));
  }

  if (input.lock) await tx.$queryRaw`SELECT user_id FROM student_profiles WHERE user_id = ${input.studentId}::uuid FOR SHARE`;
  const profile = await tx.studentProfile.findUnique({
    where: { userId: input.studentId },
    select: { targetUniversityId: true, targetMajorId: true, targetMajor: { select: { universityId: true, isActive: true } } },
  });
  if (profile?.targetMajorId && (!profile.targetMajor?.isActive
    || (profile.targetUniversityId && profile.targetMajor.universityId !== profile.targetUniversityId))) {
    throw new Error("studio_authority_unavailable");
  }
  const topicIds = sortedUnique([...modules.map((module) => module.topicId), ...questions.map((question) => question.topicId)]);
  return withDigest({
    version: "vera-studio-authority-v1",
    studentId: input.studentId,
    sourceIds: sortedUnique(input.selection.map((source) => source.sourceId)),
    topicIds,
    moduleIds: modules.map((module) => module.id),
    questions,
    universityIds: profile?.targetUniversityId ? [profile.targetUniversityId] : [],
    majorIds: profile?.targetMajorId ? [profile.targetMajorId] : [],
  });
}

export async function prepareStudioAuthority(
  db: typeof defaultPrisma,
  input: { studentId: string; selection: VeraContextSelection[] },
): Promise<{ identity: VeraStudioIdentityAuthority; drill: FrozenDrillAuthority | null }> {
  const practiceIds = input.selection.filter((source) => source.sourceType === "practice").map((source) => source.sourceId);
  const drill = practiceIds.length ? await prepareFrozenDrillAuthority(db, input.studentId, practiceIds) : null;
  const identity = await db.$transaction(
    (tx) => buildAuthority(tx, { ...input, drillAuthority: drill, lock: false }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return { identity, drill };
}

export async function lockAndRevalidateStudioAuthority(
  tx: Prisma.TransactionClient,
  input: {
    studentId: string;
    selection: VeraContextSelection[];
    frozen: VeraStudioIdentityAuthority;
    drill: FrozenDrillAuthority | null;
  },
): Promise<VeraStudioIdentityAuthority> {
  const frozen = assertStudioIdentityAuthority(input.frozen, input.studentId);
  const current = await buildAuthority(tx, { studentId: input.studentId, selection: input.selection, drillAuthority: input.drill, lock: true });
  if (current.digest !== frozen.digest) throw new Error("studio_authority_drift");
  return current;
}
