import "dotenv/config";

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { getTryoutForEdit, listTryouts } from "../lib/tryout/repository";
import { participantTryoutCatalogue } from "../lib/tryout/participant-repository";
import { prisma } from "../lib/prisma";

const CANONICAL_CODE = "seed:assessment:tryout:evaluasi-program:v1";
const OWNER_EMAIL = process.env.ASSESSMENT_SEED_TUTOR_EMAIL?.trim() || "tutor@vecalss.local";
const STUDENT_EMAIL = process.env.SEED_STUDENT_EMAIL?.trim() || "student@vecalss.local";

function fingerprint(id: string) {
  return createHash("sha256").update(id).digest("hex").slice(0, 10);
}

async function main() {
  const [canonical, owner, student, activeTutors] = await Promise.all([
    prisma.tryoutPackage.findUnique({
      where: { code: CANONICAL_CODE },
      select: {
        id: true,
        status: true,
        createdByUserId: true,
        sections: { select: { packageVersionId: true, items: { select: { packageVersionId: true } } } },
        attempts: { select: { id: true }, take: 1 },
      },
    }),
    prisma.user.findFirst({
      where: { email: OWNER_EMAIL, status: "active", roleAssignments: { some: { role: "tutor", revokedAt: null } } },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { email: STUDENT_EMAIL, status: "active", roleAssignments: { some: { role: "student", revokedAt: null } } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { status: "active", roleAssignments: { some: { role: "tutor", revokedAt: null } } },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);

  assert(canonical, "The canonical assessment Tryout is required for catalogue verification.");
  assert.equal(canonical.status, "published", "The canonical assessment Tryout must remain published.");
  assert(owner, "The seeded Kapten account is required for catalogue verification.");
  assert(student, "The seeded Voyager account is required for catalogue verification.");
  assert.equal(canonical.createdByUserId, owner.id, "The canonical Tryout must be owned by the seeded Kapten.");

  const hasLegacyBindings = canonical.sections.some(
    (section) => section.packageVersionId !== null || section.items.some((item) => item.packageVersionId !== null),
  );
  const [ownerCatalogue, ownerEdit, unauthorizedEdit, voyagerCatalogue] = await Promise.all([
    listTryouts(owner.id),
    getTryoutForEdit(canonical.id, owner.id),
    getTryoutForEdit(canonical.id, student.id),
    participantTryoutCatalogue(student.id),
  ]);

  assert.equal(unauthorizedEdit, null, "A Voyager must not hydrate a Kapten-owned Tryout edit route.");
  assert(voyagerCatalogue.some((tryout) => tryout.id === canonical.id), "A published canonical Tryout must remain visible in the Voyager catalogue.");
  if (hasLegacyBindings) {
    assert(canonical.attempts.length > 0, "Legacy package bindings are only valid for a historical Tryout with attempts.");
    assert.equal(ownerEdit, null, "Historical package-bound Tryouts must fail closed at the Kapten edit boundary.");
    assert(!ownerCatalogue.some((tryout) => tryout.id === canonical.id), "Historical package-bound Tryouts must stay out of the Kapten catalogue.");
  } else {
    assert.equal(ownerEdit?.id, canonical.id, "A fresh direct Tryout must hydrate for its owner.");
    assert(ownerCatalogue.some((tryout) => tryout.id === canonical.id), "A fresh direct Tryout must be discoverable by its owner.");
  }

  const otherTutor = activeTutors.find((candidate) => candidate.id !== owner.id);
  if (otherTutor) {
    const [otherCatalogue, otherEdit] = await Promise.all([
      listTryouts(otherTutor.id),
      getTryoutForEdit(canonical.id, otherTutor.id),
    ]);
    assert(!otherCatalogue.some((tryout) => tryout.id === canonical.id), "Another Kapten must not see the owner's Tryout in the catalogue.");
    assert.equal(otherEdit, null, "Another Kapten must not hydrate the owner's Tryout edit route.");
    console.log(`Catalogue DB ownership evidence passed (owner ${fingerprint(owner.id)}, other Kapten ${fingerprint(otherTutor.id)}, Voyager ${fingerprint(student.id)}).`);
  } else {
    console.log(`Catalogue DB ownership evidence passed (owner ${fingerprint(owner.id)}, Voyager ${fingerprint(student.id)}). No second active Kapten exists in this database; cross-Kapten fixture evidence remains pending a disposable fixture.`);
  }

  console.log(`Canonical catalogue disposition: ${hasLegacyBindings ? "historical-package-bound-and-hidden-from-Kapten" : "fresh-direct-and-visible-to-owner"}.`);
}

main()
  .catch((error) => {
    console.error("Tryout catalogue DB verification failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
