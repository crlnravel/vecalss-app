import "server-only";

import { ContentStatus, Prisma, QuestionRevisionProvenance, QuestionRevisionStatus, TryoutTestType } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { prisma } from "@/lib/prisma";

const SUBJECTS = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
type SubjectCode = (typeof SUBJECTS)[number];
type PackageItemInput = { pointValue: number; sourceQuestionId: string; sourceQuestionRevisionId?: string };
type PackageInput = { description: string; id?: string; items: PackageItemInput[]; sourceBankId: string; subtest: SubjectCode; title: string };
type PackageMetadataInput = { description: string; id: string; title: string };
type TestInput = { catItemCount?: number; durationMinutes: number; instructions: string; packageVersionId?: string; scoringConfig?: Record<string, unknown>; shuffleItems: boolean; subtest: SubjectCode; testType: "cbt" | "cat" };
type SaveTryoutInput = { description: string; id?: string; sections: TestInput[]; status: "draft" | "published"; title: string };
class TryoutValidationError extends Error {}

const sourceInclude = {
  currentRevision: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true } },
  questionBank: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  explanationAsset: true,
  subtest: true,
} satisfies Prisma.QuestionInclude;
const versionInclude = { package: { include: { subtest: true } }, items: { include: { options: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } } } satisfies Prisma.ReusableQuestionPackageVersionInclude;
const packageInclude = { sourceBank: true, subtest: true, items: { include: { sourceQuestion: { include: sourceInclude } }, orderBy: { sortOrder: "asc" as const } }, versions: { where: { status: ContentStatus.published }, orderBy: { versionNo: "desc" as const }, take: 1 } } satisfies Prisma.ReusableQuestionPackageInclude;
const tryoutInclude = { sections: { include: { packageVersion: { include: { package: { include: { subtest: true } } } }, subtest: true }, orderBy: { sequenceNo: "asc" as const } }, attempts: { select: { id: true }, take: 1 } } satisfies Prisma.TryoutPackageInclude;

function codeFromTitle(title: string, prefix: string) { return `${prefix}-${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "draft"}-${Date.now()}`.slice(0, 100); }
function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }
function assertPackageInput(input: PackageInput) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Paket Soal wajib diisi.");
  if (!SUBJECTS.includes(input.subtest)) throw new TryoutValidationError("Subtest Paket Soal tidak valid.");
  if (!input.sourceBankId) throw new TryoutValidationError("Pilih satu Bank Soal sumber terlebih dahulu.");
  if (!input.items.length || new Set(input.items.map((item) => item.sourceQuestionId)).size !== input.items.length || input.items.some((item) => !Number.isFinite(item.pointValue) || item.pointValue <= 0)) throw new TryoutValidationError("Paket harus berisi soal unik dengan poin positif.");
}
function assertReadySources(sources: Prisma.QuestionGetPayload<{ include: typeof sourceInclude }>[], subtest: SubjectCode, sourceBankId: string) {
  if (!sources.length || sources.some((source) => {
    const revision = source.currentRevision;
    const options = revision?.options ?? source.options;
    return source.questionBankId !== sourceBankId
      || source.questionBank?.status === ContentStatus.archived
      || source.status === ContentStatus.archived
      || revision?.status !== QuestionRevisionStatus.ready
      || source.subtest?.code !== subtest
      || source.questionBank === null
      || options.length < 2
      || options.length > 5
      || options.filter((option) => option.isCorrect).length !== 1
      || options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
      || !revision.stem.trim()
      || !isReadyAsset(revision.promptAsset)
      || !isReadyAsset(revision.explanationAsset);
  })) throw new TryoutValidationError("Paket hanya dapat memakai soal siap dari satu Bank yang aktif, dengan media siap dan Subtest yang sama.");
}
async function readAndValidatePackageSources(tx: Prisma.TransactionClient, sourceQuestionIds: string[], subtest: SubjectCode, sourceBankId: string) {
  // Lock both source questions and their Banks before rereading lifecycle/media state.
  // Bank writes use the same aggregate row, so selection cannot race an unpublish/archive.
  await tx.$queryRaw`SELECT q.id FROM questions q JOIN question_banks b ON b.id = q.question_bank_id WHERE q.id IN (${Prisma.join(sourceQuestionIds)}) ORDER BY q.id FOR SHARE OF q, b`;
  const sources = await tx.question.findMany({ where: { id: { in: sourceQuestionIds } }, include: sourceInclude });
  if (sources.length !== sourceQuestionIds.length) throw new TryoutValidationError("Sebagian sumber Paket tidak tersedia.");
  assertReadySources(sources, subtest, sourceBankId);
  return sources;
}
function toPackageDto(record: Prisma.ReusableQuestionPackageGetPayload<{ include: typeof packageInclude }>) {
  return { description: record.description ?? "", id: record.id, items: record.items.map((item) => ({ pointValue: Number(item.pointValue), sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined })), latestReadyVersionId: record.versions[0]?.id, latestReadyVersionNo: record.versions[0]?.versionNo, revision: record.revision, sourceBankId: record.sourceBankId, sourceBankName: record.sourceBank.name, status: record.status === ContentStatus.published ? "ready" as const : "draft" as const, subtest: record.subtest.code as SubjectCode, title: record.title, updatedAt: record.updatedAt.getTime() };
}
function toTryoutDto(record: Prisma.TryoutPackageGetPayload<{ include: typeof tryoutInclude }>) {
  return { description: record.description ?? "", id: record.id, locked: record.attempts.length > 0, sections: record.sections.map((section) => ({ catItemCount: section.catItemCount ?? undefined, durationMinutes: Math.round(section.durationSeconds / 60), id: section.id, instructions: section.instructions ?? "", packageVersionId: section.packageVersionId ?? undefined, packageVersionLabel: section.packageVersion ? `${section.packageVersion.package.title} · v${section.packageVersion.versionNo}` : undefined, scoringConfig: section.scoringConfig as Record<string, unknown> | undefined, shuffleItems: section.shuffleItems, subtest: section.subtest.code as SubjectCode, testType: section.testType === TryoutTestType.cat ? "cat" as const : "cbt" as const })), status: record.status === ContentStatus.published ? "published" as const : "draft" as const, title: record.title, updatedAt: record.updatedAt.getTime() };
}

async function listReusableQuestionPackages(actorId: string, options: { page?: number; query?: string; status?: "draft" | "ready"; subtest?: string } = {}) {
  const query = options.query?.trim() ?? "";
  const pageSize = 12;
  const where: Prisma.ReusableQuestionPackageWhereInput = {
    createdByUserId: actorId,
    ...(options.status ? { status: options.status === "ready" ? ContentStatus.published : ContentStatus.draft } : {}),
    ...(options.subtest ? { subtest: { code: options.subtest } } : {}),
    ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { description: { contains: query, mode: "insensitive" as const } }, { subtest: { code: { contains: query, mode: "insensitive" as const } } }] } : {}),
  };
  const totalItems = await prisma.reusableQuestionPackage.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), totalPages);
  const records = await prisma.reusableQuestionPackage.findMany({ where, include: packageInclude, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize });
  return { items: records.map(toPackageDto), page, pageSize, totalItems, totalPages };
}
async function getReusableQuestionPackageForEdit(id: string, actorId: string) { const record = await prisma.reusableQuestionPackage.findFirst({ where: { id, createdByUserId: actorId }, include: packageInclude }); return record ? toPackageDto(record) : null; }
async function getReusableQuestionPackageVersionHub(id: string, actorId: string) {
  const record = await prisma.reusableQuestionPackage.findFirst({
    where: { id, createdByUserId: actorId },
    include: { sourceBank: true, subtest: true, versions: { where: { status: ContentStatus.published }, orderBy: { versionNo: "desc" }, select: { createdAt: true, readyAt: true, versionNo: true, _count: { select: { items: true, tryoutSections: true } } } } },
  });
  if (!record) return null;
  return {
    description: record.description ?? "", id: record.id, sourceBankName: record.sourceBank.name, subtest: record.subtest.code as SubjectCode, title: record.title,
    versions: record.versions.map((version) => ({ createdAt: version.createdAt.getTime(), itemCount: version._count.items, readyAt: version.readyAt?.getTime(), testCount: version._count.tryoutSections, versionNo: version.versionNo })),
  };
}
async function getReusableQuestionPackageVersionDetail(packageId: string, versionNo: number, actorId: string) {
  const record = await prisma.reusableQuestionPackageVersion.findFirst({
    where: { packageId, versionNo, status: ContentStatus.published, package: { createdByUserId: actorId } },
    include: {
      package: { include: { subtest: true } }, sourceBank: true,
      items: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
      tryoutSections: { orderBy: [{ tryout: { title: "asc" } }, { sequenceNo: "asc" }], include: { tryout: { select: { id: true, status: true, title: true } } } },
    },
  });
  if (!record) return null;
  return {
    packageId: record.packageId, packageTitle: record.package.title, sourceBankName: record.sourceBank.name, subtest: record.package.subtest.code as SubjectCode, versionNo: record.versionNo,
    items: record.items.map((item) => ({ difficulty: item.difficulty, options: item.options.map((option) => ({ choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect })), pointValue: Number(item.pointValue), prompt: item.prompt, sortOrder: item.sortOrder })),
    tests: record.tryoutSections.map((section) => ({ id: section.id, sequenceNo: section.sequenceNo, subtest: section.subtestId, testType: section.testType === TryoutTestType.cat ? "CAT" : "CBT", title: section.title, tryoutId: section.tryout.id, tryoutStatus: section.tryout.status === ContentStatus.published ? "Terbit" : "Draf", tryoutTitle: section.tryout.title })),
  };
}
async function listReadyPackageVersions(actorId: string) {
  const records = await prisma.reusableQuestionPackageVersion.findMany({
    where: { status: ContentStatus.published, package: { createdByUserId: actorId } },
    include: { items: { select: { sourceQuestionId: true } }, package: { include: { subtest: true } } },
    orderBy: { createdAt: "desc" },
  });
  return records.map((record) => ({ id: record.id, label: `${record.package.title} · v${record.versionNo}`, subtest: record.package.subtest.code as SubjectCode }));
}

async function saveReusableQuestionPackage(input: PackageInput, actorId: string) {
  assertPackageInput(input);
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    const subtest = await tx.subtest.findUnique({ where: { code: input.subtest } });
    if (!subtest) throw new TryoutValidationError("Subtest Paket tidak ditemukan.");
    const sourceBank = await tx.questionBank.findUnique({ where: { id: input.sourceBankId }, select: { id: true } });
    if (!sourceBank) throw new TryoutValidationError("Bank sumber Paket tidak ditemukan.");
    if (id) {
      await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.reusableQuestionPackage.findFirst({ where: { id, createdByUserId: actorId } });
      if (!current) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
      if (current.subtestId !== subtest.id) throw new TryoutValidationError("Subtest Paket tidak dapat diubah setelah dibuat.");
      if (current.sourceBankId !== input.sourceBankId) throw new TryoutValidationError("Bank sumber Paket tidak dapat diubah.");
      const sources = await readAndValidatePackageSources(tx, input.items.map((item) => item.sourceQuestionId), input.subtest, input.sourceBankId);
      input.items.forEach((item) => { const source = sources.find((candidate) => candidate.id === item.sourceQuestionId); if (item.sourceQuestionRevisionId && item.sourceQuestionRevisionId !== source?.currentRevision?.id) throw new TryoutValidationError("Sumber Paket harus menunjuk QuestionRevision aktif yang sama."); });
      await tx.reusableQuestionPackage.update({ where: { id }, data: { description: input.description.trim() || null, revision: { increment: 1 }, title: input.title.trim(), updatedByUserId: actorId } });
      await tx.reusableQuestionPackageItem.deleteMany({ where: { packageId: id } });
    } else {
      const sources = await readAndValidatePackageSources(tx, input.items.map((item) => item.sourceQuestionId), input.subtest, input.sourceBankId);
      input.items.forEach((item) => { const source = sources.find((candidate) => candidate.id === item.sourceQuestionId); if (item.sourceQuestionRevisionId && item.sourceQuestionRevisionId !== source?.currentRevision?.id) throw new TryoutValidationError("Sumber Paket harus menunjuk QuestionRevision aktif yang sama."); });
      const created = await tx.reusableQuestionPackage.create({ data: { code: codeFromTitle(input.title, "paket"), createdByUserId: actorId, description: input.description.trim() || null, sourceBankId: input.sourceBankId, subtestId: subtest.id, title: input.title.trim(), updatedByUserId: actorId } });
      id = created.id;
    }
    const sources = await readAndValidatePackageSources(tx, input.items.map((item) => item.sourceQuestionId), input.subtest, input.sourceBankId);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    await tx.reusableQuestionPackageItem.createMany({ data: input.items.map((item, index) => {
      const source = sourceById.get(item.sourceQuestionId)!;
      return { packageId: id!, pointValue: item.pointValue, sourceContentDigest: source.currentRevision!.contentDigest, sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: source.currentRevision!.id, sourceRevisionProvenance: source.currentRevision!.provenance, sortOrder: index + 1 };
    }) });
    return toPackageDto(await tx.reusableQuestionPackage.findUniqueOrThrow({ where: { id }, include: packageInclude }));
  });
}

async function saveReusableQuestionPackageMetadata(input: PackageMetadataInput, actorId: string) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Paket Soal wajib diisi.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${input.id}::uuid FOR UPDATE`;
    const current = await tx.reusableQuestionPackage.findFirst({ where: { id: input.id, createdByUserId: actorId } });
    if (!current) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
    return toPackageDto(await tx.reusableQuestionPackage.update({ where: { id: input.id }, data: { description: input.description.trim() || null, revision: { increment: 1 }, title: input.title.trim(), updatedByUserId: actorId }, include: packageInclude }));
  });
}

async function readyReusableQuestionPackageVersion(packageId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reusable_question_packages WHERE id = ${packageId}::uuid FOR UPDATE`;
    const pkg = await tx.reusableQuestionPackage.findFirst({ where: { id: packageId, createdByUserId: actorId }, include: { subtest: true, items: { orderBy: { sortOrder: "asc" } } } });
    if (!pkg) throw new TryoutValidationError("Paket Soal tidak ditemukan.");
    const sourceBank = await tx.questionBank.findUnique({ where: { id: pkg.sourceBankId }, select: { id: true } });
    if (!sourceBank) throw new TryoutValidationError("Bank sumber Paket tidak ditemukan.");
    const [sources, versionCount] = await Promise.all([
      readAndValidatePackageSources(tx, pkg.items.map((item) => item.sourceQuestionId), pkg.subtest.code as SubjectCode, pkg.sourceBankId),
      tx.reusableQuestionPackageVersion.count({ where: { packageId } }),
    ]);
    // Build a draft snapshot first. The database guard makes the final ready
    // state immutable, including its children, once this transition completes.
    const version = await tx.reusableQuestionPackageVersion.create({ data: { createdByUserId: actorId, packageId, sourceBankId: pkg.sourceBankId, versionNo: versionCount + 1 } });
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    await Promise.all(pkg.items.map(async (membership) => {
      const source = sourceById.get(membership.sourceQuestionId)!;
      if (!membership.sourceQuestionRevisionId || membership.sourceQuestionRevisionId !== source.currentRevision?.id) {
        throw new TryoutValidationError("Paket memiliki sumber soal yang sudah berubah. Muat ulang Paket lalu simpan ulang sebelum menerbitkan versi.");
      }
      const revision = source.currentRevision!;
      const item = await tx.reusableQuestionPackageVersionItem.create({ data: { difficulty: revision.difficulty, explanation: revision.explanation, explanationAssetId: revision.explanationAssetId, packageVersionId: version.id, pointValue: membership.pointValue, prompt: revision.stem, promptAssetId: revision.promptAssetId, sortOrder: membership.sortOrder, sourceContentDigest: revision.contentDigest, sourceQuestionId: source.id, sourceQuestionRevisionId: revision.id, sourceRevisionProvenance: revision.provenance, subtestId: source.subtestId! } });
      await tx.reusableQuestionPackageVersionItemOption.createMany({ data: revision.options.map((option, index) => ({ assetId: option.assetId, choiceKey: String.fromCharCode(65 + index), content: option.content, isCorrect: option.isCorrect, packageVersionItemId: item.id, sortOrder: index, sourceQuestionOptionId: null, sourceQuestionRevisionOptionId: option.id })) });
    }));
    await tx.reusableQuestionPackageVersion.update({ where: { id: version.id }, data: { readyAt: new Date(), status: ContentStatus.published } });
    await tx.reusableQuestionPackage.update({ where: { id: packageId }, data: { revision: { increment: 1 }, status: ContentStatus.published, updatedByUserId: actorId } });
    return { id: version.id, versionNo: version.versionNo };
  });
}

async function listTryouts(actorId: string) { return (await prisma.tryoutPackage.findMany({ where: { createdByUserId: actorId }, include: tryoutInclude, orderBy: { updatedAt: "desc" } })).map(toTryoutDto); }
async function getTryoutForEdit(id: string, actorId: string) { const record = await prisma.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: tryoutInclude }); return record ? toTryoutDto(record) : null; }
function validateTryoutInput(input: SaveTryoutInput) {
  if (!input.title.trim()) throw new TryoutValidationError("Judul Tryout wajib diisi.");
  if (input.sections.length !== 7 || new Set(input.sections.map((section) => section.subtest)).size !== 7 || input.sections.some((section) => !SUBJECTS.includes(section.subtest))) throw new TryoutValidationError("Tryout harus memiliki tepat tujuh Test subject.");
  if (input.sections.some((section) => !Number.isInteger(section.durationMinutes) || section.durationMinutes < 1 || (section.testType === "cat" && (!Number.isInteger(section.catItemCount) || section.catItemCount! < 1)))) throw new TryoutValidationError("Konfigurasi durasi atau jumlah soal CAT tidak valid.");
}
async function assertCatPackageReadiness(tx: Prisma.TransactionClient, section: { catItemCount?: number; packageVersionId?: string; subtestId: string }, actorId: string) {
  if (!section.packageVersionId || !section.catItemCount) throw new TryoutValidationError("CAT memerlukan Paket Soal dan jumlah soal.");
  const version = await tx.reusableQuestionPackageVersion.findFirst({
    where: { id: section.packageVersionId, package: { createdByUserId: actorId } },
    include: { items: { select: { sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true, sourceRevisionProvenance: true, subtestId: true } } },
  });
  if (!version || version.items.length < section.catItemCount || version.items.some((item) => item.subtestId !== section.subtestId || !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown)) throw new TryoutValidationError("Pool CAT harus berasal dari versi Paket immutable yang kompatibel dan mencukupi jumlah soal CAT.");
  const revisionIds = version.items.map((item) => item.sourceQuestionRevisionId!);
  const [revisions, calibrations] = await Promise.all([
    tx.questionRevision.findMany({ where: { id: { in: revisionIds }, status: QuestionRevisionStatus.ready }, select: { contentDigest: true, id: true, questionId: true } }),
    tx.twoPlQuestionCalibration.findMany({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } }, select: { contentDigest: true, id: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true } }),
  ]);
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  if (revisions.length !== new Set(revisionIds).size || calibrations.length !== new Set(revisionIds).size || version.items.some((item) => {
    const revision = revisionById.get(item.sourceQuestionRevisionId!);
    const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId!);
    return !revision || !calibration
      || revision.questionId !== item.sourceQuestionId
      || revision.contentDigest !== item.sourceContentDigest
      || calibration.questionId !== item.sourceQuestionId
      || calibration.contentDigest !== item.sourceContentDigest
      || calibration.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown;
  })) throw new TryoutValidationError("Setiap kandidat pool CAT harus memiliki kalibrasi 2PL kanonis yang disetujui untuk QuestionRevision dan digest yang tepat.");
}
async function saveTryout(input: SaveTryoutInput, actorId: string) {
  validateTryoutInput(input);
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    if (id) {
      await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.tryoutPackage.findFirst({ where: { id, createdByUserId: actorId }, include: { attempts: { take: 1 } } });
      if (!current) throw new TryoutValidationError("Tryout tidak ditemukan.");
      if (current.attempts.length) throw new TryoutValidationError("Tryout yang sudah dimulai peserta tidak dapat diubah. Gunakan Duplicate.");
      await tx.tryoutItem.deleteMany({ where: { tryoutId: id } });
      await tx.tryoutSection.deleteMany({ where: { tryoutId: id } });
      await tx.tryoutPackage.update({ where: { id }, data: { description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, revision: { increment: 1 }, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } });
    } else {
      const created = await tx.tryoutPackage.create({ data: { code: codeFromTitle(input.title, "tryout"), createdByUserId: actorId, description: input.description.trim() || null, publishedAt: input.status === "published" ? new Date() : null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, title: input.title.trim() } }); id = created.id;
    }
    const versions = await tx.reusableQuestionPackageVersion.findMany({ where: { id: { in: input.sections.flatMap((section) => section.packageVersionId ? [section.packageVersionId] : []) }, package: { createdByUserId: actorId } }, include: versionInclude });
    const versionById = new Map(versions.map((version) => [version.id, version]));
    const sectionBySubtest = new Map(input.sections.map((section) => [section.subtest, section]));
    const subtests = await tx.subtest.findMany({ where: { code: { in: [...SUBJECTS] } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    const sectionRecords = await Promise.all(SUBJECTS.map(async (subjectCode, index) => {
      const sectionInput = sectionBySubtest.get(subjectCode)!;
      const subtest = subtestByCode.get(sectionInput.subtest);
      if (!subtest) throw new TryoutValidationError(`Subtest ${sectionInput.subtest} tidak ditemukan.`);
      const version = sectionInput.packageVersionId ? versionById.get(sectionInput.packageVersionId) : undefined;
      if (sectionInput.packageVersionId && (!version || version.status !== ContentStatus.published || version.package.subtest.code !== sectionInput.subtest)) throw new TryoutValidationError(`Paket siap untuk Test ${sectionInput.subtest} tidak valid atau tidak cocok.`);
      if (input.status === "published" && !version) throw new TryoutValidationError("Setiap Test harus mengikat satu versi Paket Soal siap sebelum Tryout diterbitkan.");
      if (input.status === "published" && sectionInput.testType === "cat") await assertCatPackageReadiness(tx, { catItemCount: sectionInput.catItemCount, packageVersionId: version?.id, subtestId: subtest.id }, actorId);
      const section = await tx.tryoutSection.create({ data: { catItemCount: sectionInput.testType === "cat" ? sectionInput.catItemCount : null, catModelVersion: sectionInput.testType === "cat" ? CANONICAL_2PL_MODEL_VERSION : null, durationSeconds: sectionInput.durationMinutes * 60, instructions: sectionInput.instructions.trim() || null, packageVersionId: version?.id, questionCount: version?.items.length ?? 0, scoringConfig: sectionInput.scoringConfig ? sectionInput.scoringConfig as Prisma.InputJsonValue : Prisma.JsonNull, sequenceNo: index + 1, shuffleItems: sectionInput.shuffleItems, subtestId: subtest.id, testType: sectionInput.testType === "cat" ? TryoutTestType.cat : TryoutTestType.cbt, title: `${sectionInput.subtest} · ${subtest.name}`, tryoutId: id! } });
      return { section, version };
    }));
    const itemEntries = sectionRecords.flatMap(({ section, version }) => version ? version.items.map((snapshot) => ({ section, snapshot, version })) : []);
    const sourceQuestionIds = itemEntries.map(({ snapshot }) => snapshot.sourceQuestionId);
    if (new Set(sourceQuestionIds).size !== sourceQuestionIds.length) throw new TryoutValidationError("Satu soal sumber hanya boleh digunakan sekali dalam seluruh Tryout.");
    await Promise.all(itemEntries.map(async ({ section, snapshot, version }) => {
      const item = await tx.tryoutItem.create({ data: { difficulty: snapshot.difficulty, explanation: snapshot.explanation, explanationAssetId: snapshot.explanationAssetId, packageCode: version.package.code, packageVersionId: version.id, points: snapshot.pointValue, prompt: snapshot.prompt, promptAssetId: snapshot.promptAssetId, sortOrder: snapshot.sortOrder, sourceContentDigest: snapshot.sourceContentDigest, sourceQuestionId: snapshot.sourceQuestionId, sourceQuestionRevisionId: snapshot.sourceQuestionRevisionId, sourceRevisionProvenance: snapshot.sourceRevisionProvenance, subtestId: snapshot.subtestId, tryoutId: id!, tryoutSectionId: section.id } });
      await tx.tryoutItemOption.createMany({ data: snapshot.options.map((option) => ({ assetId: option.assetId, choiceKey: option.choiceKey, content: option.content, isCorrect: option.isCorrect, sortOrder: option.sortOrder, sourceQuestionOptionId: option.sourceQuestionOptionId, sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId, tryoutItemId: item.id })) });
    }));
    return toTryoutDto(await tx.tryoutPackage.findUniqueOrThrow({ where: { id }, include: tryoutInclude }));
  });
}
async function duplicateTryout(id: string, actorId: string) { const current = await getTryoutForEdit(id, actorId); if (!current) throw new TryoutValidationError("Tryout tidak ditemukan."); return saveTryout({ description: current.description, sections: current.sections.map((section) => ({ catItemCount: section.catItemCount, durationMinutes: section.durationMinutes, instructions: section.instructions, packageVersionId: section.packageVersionId, scoringConfig: section.scoringConfig, shuffleItems: section.shuffleItems, subtest: section.subtest, testType: section.testType })), status: "draft", title: `${current.title} (Salinan)` }, actorId); }

export { duplicateTryout, getReusableQuestionPackageForEdit, getReusableQuestionPackageVersionDetail, getReusableQuestionPackageVersionHub, getTryoutForEdit, listReadyPackageVersions, listReusableQuestionPackages, listTryouts, readyReusableQuestionPackageVersion, saveReusableQuestionPackage, saveReusableQuestionPackageMetadata, saveTryout, TryoutValidationError };
export type { PackageInput, PackageItemInput, PackageMetadataInput, SaveTryoutInput, TestInput };
