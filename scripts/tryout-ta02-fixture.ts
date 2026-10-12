import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { getTryoutForEdit, saveTryout, type SaveTryoutInput } from "../lib/tryout/repository";
import { acquireEditLease, releaseEditLease } from "../lib/resource-edit-lock/service";

export function requireTa02LocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/vecalss_dev") throw new Error("TA-02 requires disposable local vecalss_dev on port 55432.");
}

export function ta02SaveInput(record: NonNullable<Awaited<ReturnType<typeof getTryoutForEdit>>>): SaveTryoutInput {
  return {
    description: record.description,
    title: record.title,
    status: "draft",
    sections: record.sections.map((section) => ({
      ...section,
      scoringConfig: { method: "fixed_points", correctAnswerPoints: 1, wrongAnswerPoints: 0, unansweredPoints: 0 },
      directQuestions: section.directQuestions?.map((question) => ({
        ...question,
        snapshotId: randomUUID(),
        options: question.options.map((option) => ({ ...option, snapshotOptionId: randomUUID() })),
      })),
    })),
  };
}

export async function createTa02Draft(mode?: SaveTryoutInput["admissionMode"]) {
  requireTa02LocalDatabase();
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" } });
  const source = await prisma.tryoutPackage.findFirstOrThrow({ where: { createdByUserId: owner.id, status: "published", sections: { every: { packageVersionId: null } }, items: { some: {} } }, orderBy: { createdAt: "asc" } });
  const record = await getTryoutForEdit(source.id, owner.id);
  if (!record) throw new Error("Seeded direct-question Tryout is required.");
  const draft = await saveTryout({ ...ta02SaveInput(record), admissionMode: mode, title: `TA-02 ${mode ?? "default"} ${randomUUID().slice(0, 8)}` }, owner.id);
  return { draft, ownerId: owner.id, studentId: student.id, studentEmail: student.email };
}

export async function withTa02Lease<T>(id: string, ownerId: string, run: (proof: { generation: number; token: string }) => Promise<T>) {
  const token = randomBytes(32).toString("base64url");
  const lease = await acquireEditLease({ holderUserId: ownerId, newToken: token, resourceId: id, resourceType: "tryout" });
  if (lease.state !== "owned" || lease.generation === undefined) throw new Error("TA-02 fixture edit lease unavailable.");
  const proof = { generation: lease.generation, token };
  try { return await run(proof); }
  finally { await releaseEditLease({ ...proof, holderUserId: ownerId, resourceId: id, resourceType: "tryout" }); }
}
