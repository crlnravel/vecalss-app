export type QuizPublication = "published" | "unpublished" | "archived";
export type QuizDashboardRow = {
  id: string;
  title: string;
  editingTitle: string;
  subjectCode: string;
  subjectName: string;
  creator: { name: string; avatarSrc: string | null; subject: string | null };
  questionCount: number;
  completedAttempts: number;
  averageScore: number | null;
  publication: QuizPublication;
  isHidden: boolean;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
};
export const quizDashboardSortKeys = [
  "updatedAt",
  "title",
  "subjectCode",
  "questionCount",
  "completedAttempts",
  "averageScore",
  "publication",
] as const;
export type QuizDashboardQuery = {
  q: string;
  subject: string;
  status: QuizPublication | "";
  hidden: boolean;
  changed: boolean;
  sort: (typeof quizDashboardSortKeys)[number];
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
};
export function parseQuizDashboardQuery(
  value: Record<string, string | string[] | undefined>,
): QuizDashboardQuery {
  const scalar = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : "";
  const page = Number(scalar("page"));
  const pageSize = Number(scalar("pageSize"));
  const sort = scalar("sort");
  const status = scalar("status");
  return {
    q: scalar("q").trim().slice(0, 200),
    subject: scalar("subject").trim().slice(0, 40),
    status: ["published", "unpublished", "archived"].includes(status)
      ? (status as QuizPublication)
      : "",
    hidden: scalar("hidden") === "1",
    changed: scalar("changed") === "1",
    sort: quizDashboardSortKeys.includes(sort as QuizDashboardQuery["sort"])
      ? (sort as QuizDashboardQuery["sort"])
      : "updatedAt",
    direction: scalar("direction") === "asc" ? "asc" : "desc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: [6, 10, 20, 50].includes(pageSize) ? pageSize : 6,
  };
}
export function queryQuizDashboard(
  rows: QuizDashboardRow[],
  query: QuizDashboardQuery,
) {
  const search = query.q.toLocaleLowerCase("id");
  const filtered = rows.filter(
    (row) =>
      (!query.subject ||
        query.subject === "all" ||
        row.subjectCode === query.subject) &&
      (!query.status || row.publication === query.status) &&
      (!query.hidden || row.isHidden) &&
      (!query.changed || row.hasUnpublishedChanges) &&
      (!search ||
        [row.title, row.editingTitle, row.subjectCode, row.subjectName]
          .join(" ")
          .toLocaleLowerCase("id")
          .includes(search)),
  );
  filtered.sort((a, b) => {
    const left = a[query.sort],
      right = b[query.sort];
    // Missing scores always follow scored quizzes, in either direction.
    if (left === null || right === null)
      return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "id", { numeric: true });
    return (
      (query.direction === "asc" ? comparison : -comparison) ||
      a.id.localeCompare(b.id)
    );
  });
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const normalized = { ...query, page: Math.min(query.page, pageCount) };
  return {
    rows: filtered.slice(
      (normalized.page - 1) * query.pageSize,
      normalized.page * query.pageSize,
    ),
    total,
    changed: filtered.filter((row) => row.hasUnpublishedChanges).length,
    hidden: filtered.filter((row) => row.isHidden).length,
    pageCount,
    query: normalized,
  };
}
export type QuizDashboardResult = ReturnType<typeof queryQuizDashboard>;
export function quizDashboardHref(query: QuizDashboardQuery) {
  const params = new URLSearchParams();
  for (const key of ["q", "subject", "status"] as const)
    if (query[key]) params.set(key, query[key]);
  if (query.hidden) params.set("hidden", "1");
  if (query.changed) params.set("changed", "1");
  if (query.sort !== "updatedAt") params.set("sort", query.sort);
  if (query.direction !== "desc") params.set("direction", query.direction);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== 6) params.set("pageSize", String(query.pageSize));
  return `/mentor/quiz${params.size ? `?${params}` : ""}`;
}
export function quizDashboardReturnHref(value: unknown) {
  if (typeof value !== "string" || !/^\/mentor\/quiz(?:\?|$)/.test(value))
    return "/mentor/quiz";
  const url = new URL(value, "https://local.invalid");
  if (url.pathname !== "/mentor/quiz" || url.hash) return "/mentor/quiz";
  const values: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    values[key] = all.length === 1 ? all[0] : all;
  }
  return quizDashboardHref(parseQuizDashboardQuery(values));
}
