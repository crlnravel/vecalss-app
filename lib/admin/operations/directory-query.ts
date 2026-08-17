import { DEFAULT_DIRECTORY_PAGE_SIZE, type DirectoryPageSize } from "./directory-page-constants";

const DIRECTORY_SORT_KEYS = ["student", "email", "added", "status"] as const;
type DirectorySortDirection = "asc" | "desc";
type DirectorySortKey = (typeof DIRECTORY_SORT_KEYS)[number];

type DirectoryQueryOptions = {
  addedFrom?: string | null;
  addedTo?: string | null;
  direction?: DirectorySortDirection;
  focus: string | null;
  page: number;
  pageSize?: DirectoryPageSize;
  search: string;
  sort?: DirectorySortKey | null;
  status: string;
  statuses?: readonly string[];
};

function buildDirectoryQuery({ addedFrom, addedTo, direction = "asc", focus, page, pageSize, search, sort, status, statuses }: DirectoryQueryOptions): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  const selectedStatuses = statuses?.length ? statuses : status !== "all" ? [status] : [];
  selectedStatuses.forEach((selectedStatus) => params.append("status", selectedStatus));
  if (addedFrom) params.set("addedFrom", addedFrom);
  if (addedTo) params.set("addedTo", addedTo);
  if (sort) {
    params.set("sort", sort);
    if (direction === "desc") {
      params.set("direction", direction);
    }
  }
  if (pageSize && pageSize !== DEFAULT_DIRECTORY_PAGE_SIZE) params.set("pageSize", String(pageSize));
  if (page > 1) params.set("page", String(page));
  if (focus) params.set("focus", focus);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export { DIRECTORY_SORT_KEYS, buildDirectoryQuery };
export type { DirectoryQueryOptions, DirectorySortDirection, DirectorySortKey };
