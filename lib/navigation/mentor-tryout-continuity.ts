import { buildMentorTryoutHref, parseMentorTryoutContext, type NavigationQueryInput } from "./canonical-context";

/** One status per Tryout: archived outranks hidden, which outranks published, which outranks draft. */
export type TryoutCatalogueStatus = "archived" | "draft" | "hidden" | "published";

const tryoutCatalogueStatuses: readonly string[] = ["archived", "draft", "hidden", "published"];

/** Active (published) Tryouts are the default view; `status=all` is the explicit "everything" filter, stored as "". */
export function readTryoutCatalogueContext(query: URLSearchParams) {
  const q = (query.get("q") ?? "").slice(0, 160);
  const status = query.get("status");
  const page = Number(query.get("page"));
  return {
    q,
    status: (status === "all" ? "" : status && tryoutCatalogueStatuses.includes(status) ? status : "published") as "" | TryoutCatalogueStatus,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  } as const;
}

export function buildTryoutCatalogueHref(context: ReturnType<typeof readTryoutCatalogueContext>) {
  const query = new URLSearchParams();
  if (context.q) query.set("q", context.q);
  query.set("status", context.status || "all");
  if (context.page > 1) query.set("page", String(context.page));
  return `/mentor/tryout?${query}`;
}

/** Only catalogue returns are carried automatically; never trust arbitrary URLs. */
export function tryoutCatalogueReturnHref(value: string | null | undefined) {
  if (!value || !value.startsWith("/mentor/tryout") || value.startsWith("//")) return undefined;
  const url = new URL(value, "http://local");
  if (url.origin !== "http://local" || url.pathname !== "/mentor/tryout") return undefined;
  return buildTryoutCatalogueHref(readTryoutCatalogueContext(url.searchParams));
}

export function withTryoutCatalogueReturn(href: string, returnTo: string | null | undefined) {
  const catalogue = tryoutCatalogueReturnHref(returnTo);
  if (!catalogue) return href;
  const url = new URL(href, "http://local");
  if (url.origin !== "http://local" || !url.pathname.startsWith("/mentor/tryout/")) return href;
  url.searchParams.set("returnTo", catalogue);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function tryoutWorkspaceForQuery(query: NavigationQueryInput) {
  const context = parseMentorTryoutContext(query);
  if (context.workspace === "participants" || context.workspace === "results") return "participants";
  if (context.workspace === "settings") return "settings";
  if (context.workspace === "operations" || context.delivery) return "operations";
  return "subtests";
}

export function buildTryoutWorkspaceHref(id: string, tab: "subtests" | "operations" | "participants" | "settings", query: NavigationQueryInput) {
  const context = parseMentorTryoutContext(query);
  return buildMentorTryoutHref(id, {
    ...context,
    delivery: tab === "operations" ? context.delivery : undefined,
    workspace: tab === "subtests" ? "sections" : tab,
  });
}
