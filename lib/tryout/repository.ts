import "server-only";

import { ContentStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const SUBJECTS = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"];
type TryoutSectionInput = { durationMinutes: number; id?: string; questionIds: string[]; subtest: string };
type SaveTryoutInput = { description: string; id?: string; questions: QuizQuestionSnapshot[]; sections: TryoutSectionInput[]; status: "draft" | "published"; title: string };
class TryoutValidationError extends Error {}
const include = { sections: { include: { subtest: true, items: { include: { options: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } } }, orderBy: { sequenceNo: "asc" as const } }, sessions: { select: { id: true }, take: 1 } } satisfies Prisma.TryoutPackageInclude;

function toDto(record: Prisma.TryoutPackageGetPayload<{ include: typeof include }>) {
  const questions: QuizQuestionSnapshot[] = [];
  const sections = record.sections.map((section) => ({ durationMinutes: Math.round(section.durationSeconds / 60), id: section.id, questionIds: section.items.map((item) => { questions.push({ choices: item.options.map((option) => ({ id: option.choiceKey, mediaAssetId: option.assetId ?? undefined, text: option.content })), correctChoiceId: item.options.find((option) => option.isCorrect)?.choiceKey ?? "", explanation: item.explanation ?? "", explanationMediaAssetId: item.explanationAssetId ?? undefined, id: item.id, origin: "bank", prompt: item.prompt, promptMediaAssetId: item.promptAssetId ?? undefined, sourceQuestionId: item.sourceQuestionId ?? undefined }); return item.id; }), subtest: section.subtest.code }));
  return { description: record.description ?? "", id: record.id, locked: record.sessions.length > 0, questions, sections, status: record.status === ContentStatus.published ? "published" as const : "draft" as const, title: record.title, updatedAt: record.updatedAt.getTime() };
}

async function listTryouts(actorId: string) { return (await prisma.tryoutPackage.findMany({ where: { createdByUserId: actorId }, include, orderBy: { updatedAt: "desc" } })).map(toDto); }
async function getTryoutForEdit(id: string, actorId: string) { const record = await prisma.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include }); return record ? toDto(record) : null; }

async function saveTryout(input: SaveTryoutInput, actorId: string) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Tryout wajib diisi.");
  if (input.sections.length !== 7 || new Set(input.sections.map((section) => section.subtest)).size !== 7 || input.sections.some((section) => !SUBJECTS.includes(section.subtest))) throw new TryoutValidationError("Tryout harus memiliki tujuh bagian subject.");
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    if (id) {
      await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: { sessions: { take: 1 } } });
      if (!current) throw new TryoutValidationError("Tryout tidak ditemukan.");
      if (current.sessions.length) throw new TryoutValidationError("Tryout yang sudah memiliki sesi tidak dapat diubah. Gunakan Duplicate.");
      await tx.tryoutItem.deleteMany({ where: { tryoutId: id } });
      await tx.tryoutSection.deleteMany({ where: { tryoutId: id } });
      await tx.tryoutPackage.update({ where: { id }, data: { description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, revision: { increment: 1 }, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } });
    } else {
      const created = await tx.tryoutPackage.create({ data: { code: `tryout-${Date.now()}`, createdByUserId: actorId, description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } }); id = created.id;
    }
    const subtests = await tx.subtest.findMany({ where: { code: { in: SUBJECTS } } }); const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    const submittedById = new Map(input.questions.map((question) => [question.id, question]));
    const sourceIds = [...new Set(input.questions.flatMap((question) => question.sourceQuestionId ? [question.sourceQuestionId] : []))];
    const sources = await tx.question.findMany({ where: { id: { in: sourceIds }, questionBank: { status: ContentStatus.published } }, include: { options: { orderBy: { sortOrder: "asc" } }, subtest: true } });
    if (sources.length !== sourceIds.length) throw new TryoutValidationError("Sebagian soal Bank tidak lagi tersedia.");
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    for (let sectionIndex = 0; sectionIndex < input.sections.length; sectionIndex++) {
      const sectionInput = input.sections[sectionIndex]!; const subtest = subtestByCode.get(sectionInput.subtest); if (!subtest) throw new TryoutValidationError(`Subtest ${sectionInput.subtest} tidak ditemukan.`);
      const section = await tx.tryoutSection.create({ data: { durationSeconds: Math.max(1, sectionInput.durationMinutes) * 60, questionCount: sectionInput.questionIds.length, sequenceNo: sectionIndex + 1, subtestId: subtest.id, title: `${sectionInput.subtest} · ${subtest.name}`, tryoutId: id! } });
      for (let itemIndex = 0; itemIndex < sectionInput.questionIds.length; itemIndex++) {
        const submitted = submittedById.get(sectionInput.questionIds[itemIndex]!); const source = submitted?.sourceQuestionId ? sourceById.get(submitted.sourceQuestionId) : null;
        if (!submitted || !source || source.subtest?.code !== sectionInput.subtest) throw new TryoutValidationError(`Bagian ${sectionInput.subtest} hanya menerima soal subject yang sama.`);
        const item = await tx.tryoutItem.create({ data: { difficulty: source.difficulty, explanation: source.explanation, explanationAssetId: source.explanationAssetId, packageCode: (await tx.tryoutPackage.findUniqueOrThrow({ where: { id }, select: { code: true } })).code, points: 1, prompt: source.stem, promptAssetId: source.promptAssetId, sortOrder: itemIndex + 1, sourceQuestionId: source.id, subtestId: subtest.id, tryoutId: id!, tryoutSectionId: section.id } });
        await tx.tryoutItemOption.createMany({ data: source.options.map((option, optionIndex) => ({ assetId: option.assetId, choiceKey: String.fromCharCode(65 + optionIndex), content: option.content, isCorrect: option.isCorrect, sortOrder: optionIndex, sourceQuestionOptionId: option.id, tryoutItemId: item.id })) });
      }
    }
    return toDto(await tx.tryoutPackage.findUniqueOrThrow({ where: { id }, include }));
  });
}

async function duplicateTryout(id: string, actorId: string) { const current = await getTryoutForEdit(id, actorId); if (!current) throw new TryoutValidationError("Tryout tidak ditemukan."); return saveTryout({ ...current, id: undefined, status: "draft", title: `${current.title} (Salinan)` }, actorId); }

export { duplicateTryout, getTryoutForEdit, listTryouts, saveTryout, TryoutValidationError };
export type { SaveTryoutInput };
