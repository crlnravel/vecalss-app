import type { StudentSurfaceContext } from "@/lib/student/surface-context";
import { buildBannerMakerDestinationRoute, type BannerDestination } from "@/lib/banner/destinations";

const ADMIN_STUDENT_PREVIEW_PREFIX = "/admin/student-preview" as const;

const ADMIN_STUDENT_PREVIEW_APPROVED_EXITS = [
  "/admin",
  "logout",
] as const;

type AdminStudentPreviewApprovedExit = (typeof ADMIN_STUDENT_PREVIEW_APPROVED_EXITS)[number];

function hasUnsafeRouteCharacters(path: string) {
  return path.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(path)
    || path.includes("://")
    || path.startsWith("//");
}

function normalizeRelativePreviewPath(path: string) {
  const trimmed = path.trim();
  const withLeadingSlash = trimmed ? (trimmed.startsWith("/") ? trimmed : `/${trimmed}`) : "/";

  if (hasUnsafeRouteCharacters(withLeadingSlash)) {
    throw new Error("Unsafe admin student preview route.");
  }

  // URL resolution canonicalizes dot segments before the request reaches the
  // app. Reject them (including encoded forms) so a caller cannot construct a
  // path that visually starts under the preview prefix but resolves elsewhere.
  const routePath = withLeadingSlash.split(/[?#]/u, 1)[0] ?? withLeadingSlash;
  let decodedRoutePath: string;
  try {
    decodedRoutePath = decodeURIComponent(routePath);
  } catch {
    throw new Error("Unsafe admin student preview route.");
  }

  if (
    hasUnsafeRouteCharacters(decodedRoutePath)
    || decodedRoutePath.startsWith("//")
    || decodedRoutePath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe admin student preview route.");
  }

  return withLeadingSlash;
}

/**
 * Build a route inside the preview namespace from a relative student surface
 * path. Passing a normal student route such as `/quiz` is intentional: it is
 * rewritten under the preview prefix rather than escaping to student auth.
 */
function buildAdminStudentPreviewRoute(path = "/") {
  const normalized = normalizeRelativePreviewPath(path);

  if (
    normalized === ADMIN_STUDENT_PREVIEW_PREFIX
    || normalized.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}/`)
    || normalized.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}?`)
    || normalized.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}#`)
  ) {
    return normalized;
  }

  if (normalized === "/") {
    return ADMIN_STUDENT_PREVIEW_PREFIX;
  }

  if (normalized.startsWith("/admin/") && !normalized.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}/`)) {
    throw new Error("Admin exits must use the explicit preview exit allowlist.");
  }

  return `${ADMIN_STUDENT_PREVIEW_PREFIX}${normalized}`;
}

function encodePreviewPathSegment(value: string) {
  const normalized = value.trim();
  if (!normalized || /[\u0000-\u001f\u007f\\]/u.test(normalized)) {
    throw new Error("Unsafe admin student preview route segment.");
  }

  return encodeURIComponent(normalized);
}

function buildAdminStudentPreviewMateriRoute(slug: string, lessonId?: string) {
  const encodedSlug = encodePreviewPathSegment(slug);
  const path = lessonId === undefined
    ? `/courses/${encodedSlug}`
    : `/courses/${encodedSlug}/${encodePreviewPathSegment(lessonId)}`;

  return buildAdminStudentPreviewRoute(path);
}

function buildAdminStudentPreviewQuizRoute(subjectSlug?: string, quizSlug?: string) {
  const basePath = "/quiz";
  if (subjectSlug === undefined) return buildAdminStudentPreviewRoute(basePath);

  const subjectPath = `${basePath}/${encodePreviewPathSegment(subjectSlug)}`;
  if (quizSlug === undefined) return buildAdminStudentPreviewRoute(subjectPath);

  return buildAdminStudentPreviewRoute(`${subjectPath}/${encodePreviewPathSegment(quizSlug)}`);
}

function buildAdminStudentPreviewTryoutRoute(tryoutId?: string) {
  const path = tryoutId === undefined
    ? "/tryout"
    : `/tryout/${encodePreviewPathSegment(tryoutId)}`;
  return buildAdminStudentPreviewRoute(path);
}

function buildAdminStudentPreviewMateriDocumentRoute(
  slug: string,
  lessonId: string,
  managedAssetId?: string | null,
) {
  const basePath = buildAdminStudentPreviewMateriRoute(slug, lessonId);
  const documentPath = `${basePath}/document`;
  if (!managedAssetId) return documentPath;

  const normalizedAssetId = managedAssetId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(normalizedAssetId)) {
    throw new Error("Unsafe admin student preview document reference.");
  }

  return `${documentPath}?assetId=${encodeURIComponent(normalizedAssetId)}`;
}

function buildAdminStudentPreviewBannerEditorRoute(destination: BannerDestination = "beranda") {
  return buildBannerMakerDestinationRoute(destination);
}

function isBannerRevision(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function buildAdminStudentPreviewBannerDraftRoute(
  destination: BannerDestination,
  revision: string,
) {
  if (!isBannerRevision(revision)) {
    throw new Error("Unsafe admin student preview banner revision.");
  }

  const pathByDestination: Record<BannerDestination, string> = {
    beranda: "/",
    kuis: "/quiz",
    materi: "/courses",
    tryout: "/tryout",
  };
  return buildAdminStudentPreviewRoute(
    `${pathByDestination[destination]}?bannerSource=draft&revision=${encodeURIComponent(revision)}`,
  );
}

function buildAdminStudentPreviewExit(exit: Exclude<AdminStudentPreviewApprovedExit, "logout">) {
  if (!ADMIN_STUDENT_PREVIEW_APPROVED_EXITS.includes(exit)) {
    throw new Error("Unsupported admin student preview exit.");
  }

  return exit;
}

function isAdminStudentPreviewRoute(path: string) {
  return path === ADMIN_STUDENT_PREVIEW_PREFIX
    || path.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}/`)
    || path.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}?`)
    || path.startsWith(`${ADMIN_STUDENT_PREVIEW_PREFIX}#`);
}

function isApprovedAdminStudentPreviewExit(path: string) {
  return ADMIN_STUDENT_PREVIEW_APPROVED_EXITS.includes(path as AdminStudentPreviewApprovedExit);
}

function isAllowedAdminStudentPreviewNavigation(path: string) {
  return isAdminStudentPreviewRoute(path) || isApprovedAdminStudentPreviewExit(path);
}

/**
 * Route construction follows the discriminated surface context. A preview
 * surface can never accidentally reuse the normal student route namespace.
 */
function buildStudentSurfaceRoute(context: StudentSurfaceContext, path = "/") {
  if (context.mode === "admin-preview") {
    return buildAdminStudentPreviewRoute(path);
  }

  const normalized = normalizeRelativePreviewPath(path);
  if (normalized.startsWith("/admin")) {
    throw new Error("Student routes cannot target admin paths.");
  }

  return normalized;
}

export {
  ADMIN_STUDENT_PREVIEW_APPROVED_EXITS,
  ADMIN_STUDENT_PREVIEW_PREFIX,
  buildAdminStudentPreviewExit,
  buildAdminStudentPreviewBannerEditorRoute,
  buildAdminStudentPreviewBannerDraftRoute,
  buildAdminStudentPreviewMateriDocumentRoute,
  buildAdminStudentPreviewMateriRoute,
  buildAdminStudentPreviewQuizRoute,
  buildAdminStudentPreviewRoute,
  buildAdminStudentPreviewTryoutRoute,
  buildStudentSurfaceRoute,
  isAdminStudentPreviewRoute,
  isAllowedAdminStudentPreviewNavigation,
  isApprovedAdminStudentPreviewExit,
};

export type { AdminStudentPreviewApprovedExit };
