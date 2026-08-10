import { UserStatus } from "@/generated/prisma/client";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DIRECTORY_QUERY_LENGTH = 120;
const MAX_DIRECTORY_PAGE = 1_000;

type DirectoryParamValue = string | string[] | undefined | null;

type DirectoryParamsInput = {
  focus?: DirectoryParamValue;
  page?: DirectoryParamValue;
  q?: DirectoryParamValue;
  status?: DirectoryParamValue;
};

type DirectoryParams = {
  focus: string | null;
  invalid: boolean;
  page: number;
  search: string;
  status: UserStatus | "all";
};

type DirectoryQueryOptions = Pick<DirectoryParams, "focus" | "page" | "search" | "status">;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return isUuid(normalized) ? normalized : null;
}

function readSingle(value: DirectoryParamValue) {
  if (value === undefined || value === null) {
    return { invalid: false, value: null as string | null };
  }

  if (Array.isArray(value) || typeof value !== "string") {
    return { invalid: true, value: null as string | null };
  }

  return { invalid: false, value };
}

function parseDirectoryParams(input: DirectoryParamsInput): DirectoryParams {
  let invalid = false;
  const rawQuery = readSingle(input.q);
  const search = rawQuery.value?.trim() ?? "";
  if (rawQuery.invalid || search.length > MAX_DIRECTORY_QUERY_LENGTH) {
    invalid = true;
  }

  const rawStatus = readSingle(input.status);
  let status: UserStatus | "all" = "all";
  if (rawStatus.invalid) {
    invalid = true;
  } else if (rawStatus.value && rawStatus.value !== "all") {
    if ((Object.values(UserStatus) as string[]).includes(rawStatus.value)) {
      status = rawStatus.value as UserStatus;
    } else {
      invalid = true;
    }
  }

  const rawPage = readSingle(input.page);
  let page = 1;
  if (rawPage.invalid) {
    invalid = true;
  } else if (rawPage.value !== null) {
    if (!/^\d+$/u.test(rawPage.value)) {
      invalid = true;
    } else {
      const requestedPage = Number(rawPage.value);
      if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
        invalid = true;
      } else {
        page = Math.min(requestedPage, MAX_DIRECTORY_PAGE);
        invalid ||= requestedPage > MAX_DIRECTORY_PAGE;
      }
    }
  }

  const rawFocus = readSingle(input.focus);
  let focus: string | null = null;
  if (rawFocus.invalid) {
    invalid = true;
  } else if (rawFocus.value !== null) {
    focus = parseUuid(rawFocus.value);
    if (!focus) {
      invalid = true;
    }
  }

  return {
    focus,
    invalid,
    page,
    search: invalid && search.length > MAX_DIRECTORY_QUERY_LENGTH ? "" : search,
    status,
  };
}

function parseDirectoryQuery(query: string): DirectoryParams {
  if (!query || query.length > 320 || !query.startsWith("?")) {
    return { focus: null, invalid: Boolean(query), page: 1, search: "", status: "all" };
  }

  const params = new URLSearchParams(query.slice(1));
  const valueFor = (key: string): DirectoryParamValue => {
    const values = params.getAll(key);
    return values.length > 1 ? values : values[0];
  };

  return parseDirectoryParams({
    focus: valueFor("focus"),
    page: valueFor("page"),
    q: valueFor("q"),
    status: valueFor("status"),
  });
}

function buildDirectoryQuery({ focus, page, search, status }: DirectoryQueryOptions): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  if (focus) params.set("focus", focus);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export {
  MAX_DIRECTORY_PAGE,
  MAX_DIRECTORY_QUERY_LENGTH,
  buildDirectoryQuery,
  isUuid,
  parseDirectoryParams,
  parseDirectoryQuery,
  parseUuid,
};
export type { DirectoryParams, DirectoryParamsInput, DirectoryParamValue, DirectoryQueryOptions };
