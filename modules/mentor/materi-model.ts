import { courseCatalogue } from "@/modules/courses/data";

/**
 * The Student Materi catalogue is the taxonomy authority. This explicit
 * allowlist keeps the mentor boundary read-only while limiting Materi to the
 * seven courses that already exist for learners.
 */
const mentorSubjectToStudentCourseSlug = {
  "penalaran-umum": "penalaran-umum",
  "pengetahuan-pemahaman-umum": "pengetahuan-pemahaman-umum",
  "pemahaman-bacaan-menulis": "pemahaman-bacaan-menulis",
  "pengetahuan-kuantitatif": "pengetahuan-kuantitatif",
  "literasi-bahasa-indonesia": "literasi-bahasa-indonesia",
  "literasi-bahasa-inggris": "literasi-bahasa-inggris",
  "penalaran-matematika": "penalaran-matematika",
} as const;

type MentorSubjectSlug = keyof typeof mentorSubjectToStudentCourseSlug;
type MateriReadiness = "ready" | "incomplete";
type MateriMigrationState = "canonical" | "needs-review";

type CanonicalMateriSection = {
  courseSlug: string;
  index: number;
  sectionId: string;
  subjectSlug: MentorSubjectSlug;
  title: string;
};

type MateriSubject = {
  code: string;
  description: string;
  name: string;
  sections: CanonicalMateriSection[];
  slug: MentorSubjectSlug;
};

type MateriPlacementRecord = {
  id: string;
  position: number;
  sectionId: string | null;
  subjectSlug: string;
};

function isMentorSubjectSlug(value: string): value is MentorSubjectSlug {
  return value in mentorSubjectToStudentCourseSlug;
}

function getStudentCourseSlugForMentorSubject(subjectSlug: string) {
  return isMentorSubjectSlug(subjectSlug)
    ? mentorSubjectToStudentCourseSlug[subjectSlug]
    : undefined;
}

/**
 * Copy the student-facing taxonomy into plain mentor metadata. Course icons,
 * lessons, and learner progress deliberately do not cross this boundary.
 */
function getMateriSubjects(): MateriSubject[] {
  return (Object.keys(mentorSubjectToStudentCourseSlug) as MentorSubjectSlug[])
    .flatMap((subjectSlug) => {
      const courseSlug = mentorSubjectToStudentCourseSlug[subjectSlug];
      const course = courseCatalogue.find((candidate) => candidate.slug === courseSlug);

      if (!course) {
        return [];
      }

      return [{
        code: course.title,
        description: course.description,
        name: course.description,
        sections: course.sections.map((section, index) => ({
          courseSlug: course.slug,
          index,
          sectionId: `${course.slug}:section-${index}`,
          subjectSlug,
          title: section.title,
        })),
        slug: subjectSlug,
      }];
    });
}

const materiSubjects = getMateriSubjects();

function getMateriSubject(subjectSlug: string) {
  return materiSubjects.find((subject) => subject.slug === subjectSlug);
}

function getMateriSubjectRoute(subjectSlug: string) {
  return getMateriSubject(subjectSlug)
    ? `/mentor/materi/subject/${subjectSlug}`
    : undefined;
}

/**
 * A return destination is intentionally narrower than a generic internal
 * redirect. Materi editors only return to a known subject inventory, so a
 * query value can never send a Kapten to another workspace or external URL.
 */
function getValidatedMateriReturnTo(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  return materiSubjects.some(
    (subject) => value === `/mentor/materi/subject/${subject.slug}`,
  )
    ? value
    : undefined;
}

/**
 * Return serializable section metadata. This intentionally copies only the
 * learner-facing label/order and never exposes course icons or lesson content.
 */
function getCanonicalMateriSections(subjectSlug: string): CanonicalMateriSection[] {
  return getMateriSubject(subjectSlug)?.sections ?? [];
}

function getCanonicalMateriSection(subjectSlug: string, sectionId: string | null) {
  if (!sectionId) {
    return undefined;
  }

  return getCanonicalMateriSections(subjectSlug).find(
    (section) => section.sectionId === sectionId,
  );
}

function getCanonicalMateriSectionIndex(subjectSlug: string, sectionId: string | null) {
  return getCanonicalMateriSection(subjectSlug, sectionId)?.index ?? Number.MAX_SAFE_INTEGER;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getMateriReadiness(input: {
  duration: string;
  sectionId: string | null;
  subjectSlug: string;
  title: string;
  videoUrl: string;
}): MateriReadiness {
  const hasCanonicalSection = Boolean(
    getCanonicalMateriSection(input.subjectSlug, input.sectionId),
  );

  return input.title.trim()
    && input.duration.trim()
    && isMentorSubjectSlug(input.subjectSlug)
    && hasCanonicalSection
    && isValidHttpUrl(input.videoUrl)
    ? "ready"
    : "incomplete";
}

/**
 * Canonical subject inventory order: section order, explicit position, then
 * stable lesson ID. Lifecycle status and update timestamps are deliberately
 * absent from this comparator.
 */
function compareMateriInventoryOrder(
  a: MateriPlacementRecord,
  b: MateriPlacementRecord,
) {
  const sectionOrderDifference =
    getCanonicalMateriSectionIndex(a.subjectSlug, a.sectionId) -
    getCanonicalMateriSectionIndex(b.subjectSlug, b.sectionId);

  if (sectionOrderDifference !== 0) {
    return sectionOrderDifference;
  }

  if (a.position !== b.position) {
    return a.position - b.position;
  }

  return a.id.localeCompare(b.id);
}

function sortMateriInventory<T extends MateriPlacementRecord>(records: readonly T[]) {
  return [...records].sort(compareMateriInventoryOrder);
}

export {
  compareMateriInventoryOrder,
  getMateriSubject,
  getMateriSubjects,
  getCanonicalMateriSection,
  getCanonicalMateriSectionIndex,
  getCanonicalMateriSections,
  getMateriReadiness,
  getStudentCourseSlugForMentorSubject,
  getMateriSubjectRoute,
  getValidatedMateriReturnTo,
  isMentorSubjectSlug,
  isValidHttpUrl,
  materiSubjects,
  mentorSubjectToStudentCourseSlug,
  sortMateriInventory,
};

export type {
  CanonicalMateriSection,
  MateriMigrationState,
  MateriPlacementRecord,
  MateriReadiness,
  MateriSubject,
  MentorSubjectSlug,
};
