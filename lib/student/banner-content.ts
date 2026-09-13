const STUDENT_BANNERS_CONFIG_KEY = "student.banners";

const STUDENT_BANNER_KEYS = ["beranda", "materi", "kuis", "tryout"] as const;

type StudentBannerKey = (typeof STUDENT_BANNER_KEYS)[number];

type StudentBannerContent = {
  description: string;
  title: string;
};

type StudentBannerSet = Record<StudentBannerKey, StudentBannerContent>;

type StudentBannerVariables = {
  firstName?: string;
  target?: string;
};

type StudentBannerVariableInput = {
  fullName: string;
  targetMajor?: string | null;
  targetUniversity?: string | null;
};

const STUDENT_BANNER_DEFAULTS: StudentBannerSet = {
  beranda: {
    description: "Semangat mengejar {target} ya!",
    title: "Halo, {firstName}. Lanjutkan rute belajarmu.",
  },
  materi: {
    description: "Pilih subtes yang ingin dipelajari, lalu ikuti jalur materi secara berurutan sampai selesai.",
    title: "Materi",
  },
  kuis: {
    description: "Temukan kuis berdasarkan mata pelajaran dan materi yang ingin kamu pelajari.",
    title: "Kuis",
  },
  tryout: {
    description: "Pilih tryout sesuai kebutuhanmu, tetapkan target kampus, lalu mulai mengerjakan. Semua progres akan tersimpan otomatis.",
    title: "Tryout",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStoredText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStudentBanners(value: unknown): StudentBannerSet {
  const stored = isRecord(value) ? value : {};

  return Object.fromEntries(
    STUDENT_BANNER_KEYS.map((key) => {
      const storedBanner = isRecord(stored[key]) ? stored[key] : {};
      const defaults = STUDENT_BANNER_DEFAULTS[key];

      return [key, {
        description: readStoredText(storedBanner.description, defaults.description),
        title: readStoredText(storedBanner.title, defaults.title),
      }];
    }),
  ) as StudentBannerSet;
}

function buildStudentBannerVariables({
  fullName,
  targetMajor,
  targetUniversity,
}: StudentBannerVariableInput): StudentBannerVariables {
  const firstName = fullName.trim().split(/\s+/u)[0] || "Voyager";
  const target = [targetMajor, targetUniversity]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" · ") || "target belajarmu";

  return { firstName, target };
}

function resolveStudentBannerText(value: string, variables: StudentBannerVariables = {}) {
  return value.replace(/\{(firstName|target)\}/g, (_match, key: keyof StudentBannerVariables) => variables[key] ?? "");
}

export {
  buildStudentBannerVariables,
  normalizeStudentBanners,
  resolveStudentBannerText,
  STUDENT_BANNERS_CONFIG_KEY,
  STUDENT_BANNER_DEFAULTS,
  STUDENT_BANNER_KEYS,
};
export type {
  StudentBannerContent,
  StudentBannerKey,
  StudentBannerSet,
  StudentBannerVariableInput,
  StudentBannerVariables,
};
