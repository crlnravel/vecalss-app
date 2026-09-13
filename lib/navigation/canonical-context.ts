/**
 * Shared, dependency-free route context helpers.
 *
 * Route loaders use this module as the single place where query values are
 * interpreted.  Builders intentionally keep declared values in the URL (even
 * when they are empty/default values) so a canonical redirect never erases a
 * user's valid context.  Callers should render a typed unavailable state when
 * `issues` is non-empty instead of substituting an unrelated default.
 */

export type NavigationQueryValue = string | string[] | undefined | null;
export type NavigationQueryInput =
  | URLSearchParams
  | Readonly<Record<string, NavigationQueryValue>>;

export type CanonicalContextField =
  | "artifact"
  | "category"
  | "delivery"
  | "direction"
  | "folder"
  | "page"
  | "parent"
  | "participant"
  | "preview"
  | "purpose"
  | "q"
  | "returnTo"
  | "session"
  | "sort"
  | "status"
  | "subject"
  | "subtest"
  | "tool"
  | "workspace";

export type CanonicalContextIssue = {
  code: "invalid" | "unsupported";
  field: CanonicalContextField;
  message: string;
  value?: string;
};

export const QUESTION_BANK_PURPOSES = ["quiz", "tryout"] as const;
export type QuestionBankPurpose = (typeof QUESTION_BANK_PURPOSES)[number];

export const MATERI_STATUSES = ["draft", "published", "archived", "scheduled"] as const;
export type MateriStatus = (typeof MATERI_STATUSES)[number];
export const MATERI_SORT_KEYS = ["title", "status"] as const;
export type MateriSortKey = (typeof MATERI_SORT_KEYS)[number];

export const QUESTION_BANK_STATUSES = ["draft", "published", "archived", "scheduled"] as const;
export type QuestionBankStatus = (typeof QUESTION_BANK_STATUSES)[number];
export const QUESTION_BANK_SORT_KEYS = ["updated", "name", "questions"] as const;
export type QuestionBankSortKey = (typeof QUESTION_BANK_SORT_KEYS)[number];

export const TRYOUT_WORKSPACES = [
  "basics",
  "sections",
  "review",
  "schedule",
  "live",
  "attempts",
  "results",
] as const;
export type TryoutWorkspace = (typeof TRYOUT_WORKSPACES)[number];

export const TRYOUT_DELIVERIES = ["policy", "sessions", "participants"] as const;
export type TryoutDelivery = (typeof TRYOUT_DELIVERIES)[number];

export const VERA_TOOL_IDS = ["analysis", "route", "drill", "review", "ptn", "summary"] as const;
export type VeraToolId = (typeof VERA_TOOL_IDS)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9:_-]{1,180}$/u;
const MAX_PAGE = 1_000;
const MAX_SEARCH_LENGTH = 160;

function valuesFor(input: NavigationQueryInput, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);

  const value = input[key];
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [value];
}

function firstValue(input: NavigationQueryInput, key: string) {
  return valuesFor(input, key)[0];
}

function hasValue(input: NavigationQueryInput, key: string) {
  if (input instanceof URLSearchParams) return input.has(key);
  return Object.prototype.hasOwnProperty.call(input, key);
}

function singleValue(input: NavigationQueryInput, key: string) {
  const values = valuesFor(input, key);
  return {
    invalid: values.length > 1,
    present: hasValue(input, key),
    value: values[0],
  };
}

function issue(
  field: CanonicalContextField,
  value: unknown,
  message: string,
  code: CanonicalContextIssue["code"] = "invalid",
): CanonicalContextIssue {
  return {
    code,
    field,
    message,
    ...(typeof value === "string" ? { value } : {}),
  };
}

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isSafeIdentifier(value: string) {
  return SAFE_IDENTIFIER_PATTERN.test(value);
}

function encodeSegment(value: string) {
  const normalized = value.trim();
  if (!normalized || /[\\\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error("Unsafe navigation path segment.");
  }
  return encodeURIComponent(normalized);
}

function appendQuery(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function copyQuery(input: NavigationQueryInput, params: URLSearchParams) {
  if (input instanceof URLSearchParams) {
    input.forEach((value, key) => params.append(key, value));
    return;
  }

  Object.keys(input).sort().forEach((key) => {
    valuesFor(input, key).forEach((value) => params.append(key, value));
  });
}

function normalizeInternalPath(value: string, allowedPrefixes: readonly string[]) {
  const normalized = value.trim();
  if (!normalized || /[\\\u0000-\u001f\u007f]/u.test(normalized) || normalized.startsWith("//")) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized, "https://vecalss.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "https://vecalss.invalid" || !parsed.pathname.startsWith("/")) return null;
  if (parsed.pathname.split("/").some((segment) => segment === "." || segment === "..")) return null;
  if (!allowedPrefixes.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) return null;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function returnToIssue(value: string | undefined, allowedPrefixes: readonly string[]) {
  return value === undefined || normalizeInternalPath(value, allowedPrefixes)
    ? null
    : issue("returnTo", value, "Tujuan kembali tidak tersedia untuk ruang ini.", "unsupported");
}

const MATERI_RETURN_PREFIXES = ["/mentor/materi"] as const;
const TRYOUT_RETURN_PREFIXES = ["/mentor/tryout"] as const;
const STUDENT_RETURN_PREFIXES = ["/dashboard", "/courses", "/quiz", "/tryout", "/vera-ai", "/settings"] as const;

export function readQueryValue(input: NavigationQueryInput, key: string) {
  return firstValue(input, key);
}

export function readQueryValues(input: NavigationQueryInput, key: string) {
  return valuesFor(input, key);
}

export function safeReturnTo(value: string | undefined, allowedPrefixes: readonly string[] = STUDENT_RETURN_PREFIXES) {
  return value === undefined ? undefined : normalizeInternalPath(value, allowedPrefixes) ?? null;
}

export function getSafeRedirectUrl(value: string, allowedPrefixes: readonly string[]) {
  return normalizeInternalPath(value, allowedPrefixes) ?? allowedPrefixes[0] ?? "/";
}

export function canonicalContextMessage(issues: readonly CanonicalContextIssue[]) {
  if (!issues.length) return null;
  return issues[0]?.message ?? "Konteks halaman ini tidak tersedia. Pilih konteks lain untuk melanjutkan.";
}

export function parseMateriSubjectQuery(input: NavigationQueryInput) {
  const issues: CanonicalContextIssue[] = [];
  const statusParam = singleValue(input, "status");
  const sortParam = singleValue(input, "sort");
  const directionParam = singleValue(input, "direction");
  const pageParam = singleValue(input, "page");
  const queryParam = singleValue(input, "q");

  if (statusParam.invalid) issues.push(issue("status", statusParam.value, "Status materi hanya boleh dipilih satu kali."));
  const status = statusParam.value ?? "";
  if (status && !MATERI_STATUSES.includes(status as MateriStatus)) {
    issues.push(issue("status", status, "Status materi tersebut tidak tersedia."));
  }

  if (sortParam.invalid) issues.push(issue("sort", sortParam.value, "Urutan materi hanya boleh dipilih satu kali."));
  const sort = sortParam.value ?? "";
  if (sort && !MATERI_SORT_KEYS.includes(sort as MateriSortKey)) {
    issues.push(issue("sort", sort, "Urutan materi tersebut tidak tersedia."));
  }

  if (directionParam.invalid) issues.push(issue("direction", directionParam.value, "Arah urutan materi tidak valid."));
  const direction = directionParam.value === undefined || directionParam.value === "asc" || directionParam.value === "desc"
    ? (directionParam.value ?? "asc")
    : (issues.push(issue("direction", directionParam.value, "Arah urutan materi harus asc atau desc.")), "asc");

  if (pageParam.invalid) issues.push(issue("page", pageParam.value, "Halaman materi hanya boleh berupa angka positif."));
  let page = 1;
  if (pageParam.value !== undefined) {
    if (!/^[1-9]\d*$/u.test(pageParam.value)) {
      issues.push(issue("page", pageParam.value, "Halaman materi hanya boleh berupa angka positif."));
    } else {
      const parsedPage = Number(pageParam.value);
      if (!Number.isSafeInteger(parsedPage) || parsedPage > MAX_PAGE) {
        issues.push(issue("page", pageParam.value, `Halaman materi harus berada antara 1 dan ${MAX_PAGE}.`));
      } else page = parsedPage;
    }
  }

  if (queryParam.invalid) issues.push(issue("q", queryParam.value, "Pencarian materi hanya boleh memiliki satu nilai."));
  const q = queryParam.value?.trim() ?? "";
  if (q.length > MAX_SEARCH_LENGTH) issues.push(issue("q", q, "Pencarian materi terlalu panjang."));

  return {
    direction: direction as "asc" | "desc",
    issues,
    page,
    q,
    sort: (sort && MATERI_SORT_KEYS.includes(sort as MateriSortKey) ? sort : "") as MateriSortKey | "",
    status: (status && MATERI_STATUSES.includes(status as MateriStatus) ? status : "") as MateriStatus | "",
    present: {
      direction: directionParam.present,
      page: pageParam.present,
      q: queryParam.present,
      sort: sortParam.present,
      status: statusParam.present,
    },
  };
}

export type MateriSubjectQuery = ReturnType<typeof parseMateriSubjectQuery>;

export function buildMentorMateriSubjectHref(subjectSlug: string, query: Partial<MateriSubjectQuery> = {}) {
  const params = new URLSearchParams();
  if (query.status !== undefined && query.status !== "") params.set("status", query.status);
  if (query.sort !== undefined && query.sort !== "") params.set("sort", query.sort);
  if (query.direction !== undefined) params.set("direction", query.direction);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.q !== undefined) params.set("q", query.q);
  return appendQuery(`/mentor/materi/subject/${encodeSegment(subjectSlug)}`, params);
}

export function buildMentorMateriCreateHref(subjectSlug?: string, returnTo?: string) {
  const params = new URLSearchParams();
  if (subjectSlug) params.set("subject", subjectSlug);
  if (returnTo) params.set("returnTo", returnTo);
  return appendQuery("/mentor/materi/create", params);
}

export function buildMentorMateriDetailHref(materiCode: string, options: { preview?: boolean; returnTo?: string } = {}) {
  const params = new URLSearchParams();
  if (options.preview) params.set("preview", "1");
  if (options.returnTo) params.set("returnTo", options.returnTo);
  return appendQuery(`/mentor/materi/${encodeSegment(materiCode)}`, params);
}

export function parseMateriReturnTo(input: NavigationQueryInput) {
  const returnToParam = singleValue(input, "returnTo");
  const value = returnToParam.value;
  const issues: CanonicalContextIssue[] = [];
  if (returnToParam.invalid) issues.push(issue("returnTo", value, "Tujuan kembali materi hanya boleh dipilih satu kali."));
  const parsed = safeReturnTo(value, MATERI_RETURN_PREFIXES);
  const returnIssue = returnToIssue(value, MATERI_RETURN_PREFIXES);
  if (returnIssue) issues.push(returnIssue);
  return { issues, returnTo: parsed ?? undefined };
}

export function parseQuestionBankQuery(input: NavigationQueryInput) {
  const issues: CanonicalContextIssue[] = [];
  const purposeParam = singleValue(input, "purpose");
  if (purposeParam.invalid) issues.push(issue("purpose", purposeParam.value, "Tujuan Bank Soal hanya boleh dipilih satu kali."));
  const requestedPurpose = purposeParam.value;
  const purpose = requestedPurpose === undefined
    ? "quiz" as QuestionBankPurpose
    : QUESTION_BANK_PURPOSES.includes(requestedPurpose as QuestionBankPurpose)
      ? requestedPurpose as QuestionBankPurpose
      : (issues.push(issue("purpose", requestedPurpose, "Pilih tujuan Bank Soal: Kuis atau Tryout.")), null);

  const subtestValues = valuesFor(input, "subtest").map((value) => value.trim());
  if (subtestValues.some((value) => !value)) issues.push(issue("subtest", "", "Subtest Bank Soal tidak boleh kosong."));
  const subtest = [...new Set(subtestValues.filter((value) => value.length > 0))];
  const rawCategoryValues = valuesFor(input, "category").map((value) => value.trim());
  if (rawCategoryValues.some((value) => !value)) issues.push(issue("category", "", "Kategori Bank Soal tidak boleh kosong."));
  const categoryValues = [...new Set(rawCategoryValues.filter(Boolean))];
  const categories = categoryValues.filter((value) => {
    if (isUuid(value)) return true;
    issues.push(issue("category", value, "Kategori Bank Soal tidak tersedia."));
    return false;
  });
  const supportedSubtests = new Set(["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"]);
  subtestValues.filter(Boolean).forEach((value) => {
    if (!supportedSubtests.has(value)) issues.push(issue("subtest", value, "Subtest Bank Soal tersebut tidak tersedia."));
  });

  const folderParam = singleValue(input, "folder");
  if (folderParam.invalid) issues.push(issue("folder", folderParam.value, "Folder Bank Soal hanya boleh dipilih satu kali."));
  const folderValue = folderParam.value;
  let folder: "root" | "unfiled" | string = "root";
  if (folderValue !== undefined) {
    if (folderValue === "root" || folderValue === "unfiled") folder = folderValue;
    else if (isSafeIdentifier(folderValue) || isUuid(folderValue)) folder = folderValue;
    else issues.push(issue("folder", folderValue, "Folder Bank Soal tidak tersedia."));
  }

  const statusParam = singleValue(input, "status");
  if (statusParam.invalid) issues.push(issue("status", statusParam.value, "Status Bank Soal hanya boleh dipilih satu kali."));
  const statusValue = statusParam.value ?? "";
  if (statusValue && !QUESTION_BANK_STATUSES.includes(statusValue as QuestionBankStatus)) {
    issues.push(issue("status", statusValue, "Status Bank Soal tersebut tidak tersedia."));
  }

  const sortParam = singleValue(input, "sort");
  if (sortParam.invalid) issues.push(issue("sort", sortParam.value, "Urutan Bank Soal hanya boleh dipilih satu kali."));
  const sortValue = sortParam.value ?? "updated";
  if (!QUESTION_BANK_SORT_KEYS.includes(sortValue as QuestionBankSortKey)) {
    issues.push(issue("sort", sortValue, "Urutan Bank Soal tersebut tidak tersedia."));
  }

  const pageParam = singleValue(input, "page");
  if (pageParam.invalid) issues.push(issue("page", pageParam.value, "Halaman Bank Soal hanya boleh berupa angka positif."));
  let page = 1;
  if (pageParam.value !== undefined) {
    if (!/^[1-9]\d*$/u.test(pageParam.value)) issues.push(issue("page", pageParam.value, "Halaman Bank Soal hanya boleh berupa angka positif."));
    else {
      const parsedPage = Number(pageParam.value);
      if (!Number.isSafeInteger(parsedPage) || parsedPage > MAX_PAGE) issues.push(issue("page", pageParam.value, `Halaman Bank Soal harus berada antara 1 dan ${MAX_PAGE}.`));
      else page = parsedPage;
    }
  }

  const queryParam = singleValue(input, "q");
  if (queryParam.invalid) issues.push(issue("q", queryParam.value, "Pencarian Bank Soal hanya boleh memiliki satu nilai."));
  const q = queryParam.value?.trim() ?? "";
  if (q.length > MAX_SEARCH_LENGTH) issues.push(issue("q", q, "Pencarian Bank Soal terlalu panjang."));

  return {
    categories,
    folder,
    issues,
    page,
    present: {
      category: hasValue(input, "category"),
      folder: folderParam.present,
      page: pageParam.present,
      purpose: purposeParam.present,
      q: queryParam.present,
      sort: sortParam.present,
      status: statusParam.present,
      subtest: hasValue(input, "subtest"),
    },
    purpose,
    q,
    sort: QUESTION_BANK_SORT_KEYS.includes(sortValue as QuestionBankSortKey) ? sortValue as QuestionBankSortKey : "updated",
    status: statusValue && QUESTION_BANK_STATUSES.includes(statusValue as QuestionBankStatus) ? statusValue as QuestionBankStatus : "",
    subtest,
  };
}

export type QuestionBankQuery = ReturnType<typeof parseQuestionBankQuery>;

export function buildQuestionBankHref(query: Partial<QuestionBankQuery> = {}) {
  const params = new URLSearchParams();
  params.set("purpose", query.purpose ?? "quiz");
  (query.subtest ?? []).forEach((value) => params.append("subtest", value));
  (query.categories ?? []).forEach((value) => params.append("category", value));
  if (query.folder !== undefined) params.set("folder", query.folder === "root" ? "root" : query.folder);
  if (query.status !== undefined && query.status !== "") params.set("status", query.status);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.q !== undefined) params.set("q", query.q);
  if (query.sort !== undefined) params.set("sort", query.sort);
  return appendQuery("/mentor/quiz/question-bank", params);
}

export function buildQuestionBankCreateHref(purpose: QuestionBankPurpose = "quiz") {
  return appendQuery("/mentor/quiz/question-bank/create", new URLSearchParams({ purpose }));
}

export function buildMentorQuizSubjectHref(subjectSlug: string) {
  return `/mentor/quiz/subject/${encodeSegment(subjectSlug)}`;
}

export function buildMentorQuizCreateHref(subjectCode?: string) {
  const params = new URLSearchParams();
  if (subjectCode) params.set("subject", subjectCode);
  return appendQuery("/mentor/quiz/create", params);
}

export function buildMentorQuizEditorHref(quizId: string, subjectCode?: string) {
  const params = new URLSearchParams();
  if (subjectCode) params.set("subject", subjectCode);
  return appendQuery(`/mentor/quiz/${encodeSegment(quizId)}/editor`, params);
}

export function isVeraToolId(value: string | undefined | null): value is VeraToolId {
  return typeof value === "string" && VERA_TOOL_IDS.includes(value as VeraToolId);
}

export function buildStudentReturnHref(returnTo?: string | null) {
  return returnTo ? normalizeInternalPath(returnTo, STUDENT_RETURN_PREFIXES) ?? "/dashboard" : "/dashboard";
}

export function parseStudentContext(input: NavigationQueryInput) {
  const issues: CanonicalContextIssue[] = [];
  const returnToParam = singleValue(input, "returnTo");
  const returnToValue = returnToParam.value;
  if (returnToParam.invalid) issues.push(issue("returnTo", returnToValue, "Tujuan kembali hanya boleh dipilih satu kali."));
  const returnTo = safeReturnTo(returnToValue, STUDENT_RETURN_PREFIXES);
  const returnIssue = returnToIssue(returnToValue, STUDENT_RETURN_PREFIXES);
  if (returnIssue) issues.push(returnIssue);

  const toolParam = singleValue(input, "tool");
  const artifactParam = singleValue(input, "artifact");
  const toolValue = toolParam.value;
  const artifactValue = artifactParam.value;
  const tool = isVeraToolId(artifactValue) ? artifactValue : isVeraToolId(toolValue) ? toolValue : null;
  if (toolParam.invalid) issues.push(issue("tool", toolValue, "Alat Vera hanya boleh dipilih satu kali."));
  if (artifactParam.invalid) issues.push(issue("artifact", artifactValue, "Hasil Vera hanya boleh dipilih satu kali."));
  if (toolValue !== undefined && !isVeraToolId(toolValue)) issues.push(issue("tool", toolValue, "Alat Vera tersebut tidak tersedia."));
  if (artifactValue !== undefined && !isVeraToolId(artifactValue)) issues.push(issue("artifact", artifactValue, "Hasil Vera tersebut tidak tersedia."));

  return { artifact: artifactValue, issues, returnTo: returnTo ?? undefined, tool };
}

export function parseStudentTryoutContext(input: NavigationQueryInput) {
  const base = parseStudentContext(input);
  const sessionParam = singleValue(input, "session");
  const session = sessionParam.value?.trim() || undefined;
  const issues = [...base.issues];
  if (sessionParam.invalid || (sessionParam.present && !session) || (session !== undefined && !isSafeIdentifier(session) && !isUuid(session))) {
    issues.push(issue("session", session, "Sesi tryout tersebut tidak tersedia."));
  }
  return { ...base, issues, session };
}

export function buildStudentTryoutHref(tryoutId: string, options: { returnTo?: string; session?: string } = {}) {
  const params = new URLSearchParams();
  if (options.session) params.set("session", options.session);
  if (options.returnTo) params.set("returnTo", options.returnTo);
  return appendQuery(`/tryout/${encodeSegment(tryoutId)}`, params);
}

export function buildStudentTryoutSubrouteHref(tryoutId: string, subroute: "register" | "waiting", options: { returnTo?: string; session?: string } = {}) {
  const params = new URLSearchParams();
  if (options.session) params.set("session", options.session);
  if (options.returnTo) params.set("returnTo", options.returnTo);
  return appendQuery(`/tryout/${encodeSegment(tryoutId)}/${subroute}`, params);
}

export function buildStudentAttemptHref(attemptId: string, options: { returnTo?: string; session?: string; result?: boolean } = {}) {
  const params = new URLSearchParams();
  if (options.session) params.set("session", options.session);
  if (options.returnTo) params.set("returnTo", options.returnTo);
  return appendQuery(`/tryout/attempt/${encodeSegment(attemptId)}${options.result ? "/result" : ""}`, params);
}

export function buildAdminAiRoute(tab: "overview" | "policies" | "providers" | "reliability" | "usage", query?: NavigationQueryInput) {
  const path = tab === "overview" ? "/admin/ai" : `/admin/ai/${tab}`;
  if (!query) return path;
  const params = new URLSearchParams();
  copyQuery(query, params);
  return appendQuery(path, params);
}

export function buildAdminAiAliasTarget(tab: "policies" | "usage", query?: NavigationQueryInput) {
  return buildAdminAiRoute(tab, query);
}

export function parseMentorTryoutContext(input: NavigationQueryInput) {
  const issues: CanonicalContextIssue[] = [];
  const workspaceParam = singleValue(input, "workspace");
  const deliveryParam = singleValue(input, "delivery");
  const sessionParam = singleValue(input, "session");
  const parentParam = singleValue(input, "parent");
  const returnToParam = singleValue(input, "returnTo");

  if (workspaceParam.invalid) issues.push(issue("workspace", workspaceParam.value, "Area Tryout hanya boleh dipilih satu kali."));
  if (deliveryParam.invalid) issues.push(issue("delivery", deliveryParam.value, "Area delivery Tryout hanya boleh dipilih satu kali."));

  const workspaceAliases: Record<string, TryoutWorkspace> = {
    authoring: "sections",
    basics: "basics",
    build: "sections",
    configure_sections: "sections",
    content: "sections",
    delivery: "schedule",
    live: "live",
    operations: "attempts",
    overview: "basics",
    participants: "schedule",
    policy: "schedule",
    publish: "review",
    readiness_publish: "review",
    results: "results",
    review: "review",
    rules: "sections",
    schedule: "schedule",
    sections: "sections",
    sessions: "schedule",
    attempts: "attempts",
    questions: "sections",
  };
  const workspaceValue = workspaceParam.value;
  let workspace: TryoutWorkspace | null = null;
  if (workspaceValue !== undefined) {
    workspace = workspaceAliases[workspaceValue] ?? null;
    if (!workspace) issues.push(issue("workspace", workspaceValue, "Area Tryout tersebut tidak tersedia."));
  }

  const deliveryAliases: Record<string, TryoutDelivery> = {
    operations: "sessions",
    participants: "participants",
    policy: "policy",
    sessions: "sessions",
  };
  const deliveryValue = deliveryParam.value;
  let delivery: TryoutDelivery | null = null;
  if (deliveryValue !== undefined) {
    delivery = deliveryAliases[deliveryValue] ?? null;
    if (!delivery) issues.push(issue("delivery", deliveryValue, "Area delivery Tryout tersebut tidak tersedia."));
  } else if (workspaceValue === "policy" || workspaceValue === "sessions" || workspaceValue === "participants") {
    delivery = deliveryAliases[workspaceValue];
  }
  if (workspace !== null && workspace !== "schedule" && delivery !== null) {
    issues.push(issue("delivery", deliveryValue, "Area delivery hanya tersedia di workspace Schedule."));
  }

  const session = sessionParam.value?.trim() || undefined;
  if (sessionParam.invalid || (sessionParam.present && !session) || (session !== undefined && !isSafeIdentifier(session) && !isUuid(session))) {
    issues.push(issue("session", session, "Sesi Tryout tidak tersedia."));
  }
  const parent = parentParam.value?.trim() || undefined;
  if (parentParam.invalid || (parentParam.present && !parent) || (parent !== undefined && !isSafeIdentifier(parent) && !isUuid(parent))) {
    issues.push(issue("parent", parent, "Tryout induk tidak tersedia."));
  }

  const returnTo = safeReturnTo(returnToParam.value, TRYOUT_RETURN_PREFIXES);
  if (returnToParam.invalid) issues.push(issue("returnTo", returnToParam.value, "Tujuan kembali Tryout hanya boleh dipilih satu kali."));
  const returnIssue = returnToIssue(returnToParam.value, TRYOUT_RETURN_PREFIXES);
  if (returnIssue) issues.push(returnIssue);

  return {
    delivery,
    issues,
    parent,
    present: {
      delivery: deliveryParam.present,
      parent: parentParam.present,
      returnTo: returnToParam.present,
      session: sessionParam.present,
      workspace: workspaceParam.present,
    },
    returnTo: returnTo ?? undefined,
    session,
    workspace,
  };
}

export type MentorTryoutContext = ReturnType<typeof parseMentorTryoutContext>;

function tryoutQueryParams(context: Partial<MentorTryoutContext>) {
  const params = new URLSearchParams();
  if (context.workspace !== undefined && context.workspace !== null) params.set("workspace", context.workspace);
  if (context.delivery !== undefined && context.delivery !== null) params.set("delivery", context.delivery);
  if (context.session) params.set("session", context.session);
  if (context.parent) params.set("parent", context.parent);
  if (context.returnTo) params.set("returnTo", context.returnTo);
  return params;
}

export function buildMentorTryoutHref(tryoutId: string, context: Partial<MentorTryoutContext> = {}) {
  return appendQuery(`/mentor/tryout/${encodeSegment(tryoutId)}`, tryoutQueryParams(context));
}

export function buildMentorTryoutCreateHref(context: Partial<MentorTryoutContext> = {}) {
  return appendQuery("/mentor/tryout/create", tryoutQueryParams(context));
}

export function buildMentorTryoutOperationsHref(tryoutId: string, context: Partial<MentorTryoutContext> = {}) {
  return buildMentorTryoutHref(tryoutId, {
    ...context,
    delivery: context.delivery ?? "sessions",
    workspace: context.workspace ?? "schedule",
  });
}

export function buildMentorTryoutAttemptHref(tryoutId: string, attemptId: string, context: Partial<MentorTryoutContext> & { participant?: string } = {}) {
  const params = tryoutQueryParams(context);
  if (context.participant) params.set("participant", context.participant);
  return appendQuery(`/mentor/tryout/${encodeSegment(tryoutId)}/operations/attempts/${encodeSegment(attemptId)}`, params);
}

export function parseMentorTryoutAttemptContext(input: NavigationQueryInput) {
  const base = parseMentorTryoutContext(input);
  const participantParam = singleValue(input, "participant");
  const participant = participantParam.value?.trim() || undefined;
  const issues = [...base.issues];
  if (participantParam.invalid || (participantParam.present && !participant) || (participant !== undefined && !isSafeIdentifier(participant) && !isUuid(participant))) {
    issues.push(issue("participant", participant, "Peserta attempt tidak tersedia."));
  }
  return { ...base, issues, participant };
}

export function buildCanonicalQuery(input: NavigationQueryInput) {
  const params = new URLSearchParams();
  copyQuery(input, params);
  return params;
}

export function canonicalQueryEquals(input: NavigationQueryInput, href: string) {
  const [, query = ""] = href.split("?", 2);
  const normalize = (params: URLSearchParams) => [...params.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return normalize(buildCanonicalQuery(input)) === normalize(new URLSearchParams(query));
}

export function getStudentEntryPath({ mustChangePassword, onboardingStatus }: { mustChangePassword: boolean; onboardingStatus?: string | null }) {
  if (mustChangePassword) return "/change-password";
  if (onboardingStatus === "completed" || onboardingStatus === "skipped") return "/dashboard";
  return "/onboarding";
}

export {
  MATERI_RETURN_PREFIXES,
  STUDENT_RETURN_PREFIXES,
  TRYOUT_RETURN_PREFIXES,
  isSafeIdentifier,
  isUuid,
  normalizeInternalPath,
};
