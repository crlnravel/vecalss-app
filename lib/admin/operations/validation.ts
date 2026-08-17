import { UserStatus } from "@/generated/prisma/client";
import {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  type DirectoryPageSize,
} from "./directory-page-constants";
import {
  DIRECTORY_SORT_KEYS,
  type DirectorySortDirection,
  type DirectorySortKey,
} from "./directory-query";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DIRECTORY_QUERY_LENGTH = 120;
const MAX_DIRECTORY_PAGE = 1_000;
type DirectoryParamValue = string | string[] | undefined | null;

type DirectoryParamsInput = {
  addedFrom?: DirectoryParamValue;
  addedTo?: DirectoryParamValue;
  direction?: DirectoryParamValue;
  focus?: DirectoryParamValue;
  page?: DirectoryParamValue;
  pageSize?: DirectoryParamValue;
  q?: DirectoryParamValue;
  sort?: DirectoryParamValue;
  status?: DirectoryParamValue;
};

type DirectoryParams = {
  addedFrom: string | null;
  addedTo: string | null;
  focus: string | null;
  invalid: boolean;
  page: number;
  pageSize: DirectoryPageSize;
  search: string;
  sort: DirectorySortKey | null;
  direction: DirectorySortDirection;
  status: UserStatus | "all";
  statuses: UserStatus[];
};

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

function readMany(value: DirectoryParamValue) {
  if (value === undefined || value === null) {
    return { invalid: false, values: [] as string[] };
  }

  const values = Array.isArray(value) ? value : [value];
  if (values.some((item) => typeof item !== "string")) {
    return { invalid: true, values: [] as string[] };
  }

  return { invalid: false, values };
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseDirectoryParams(input: DirectoryParamsInput): DirectoryParams {
  let invalid = false;
  const rawQuery = readSingle(input.q);
  const search = rawQuery.value?.trim() ?? "";
  if (rawQuery.invalid || search.length > MAX_DIRECTORY_QUERY_LENGTH) {
    invalid = true;
  }

  const rawStatus = readMany(input.status);
  let status: UserStatus | "all" = "all";
  const statuses: UserStatus[] = [];
  if (rawStatus.invalid) {
    invalid = true;
  } else if (rawStatus.values.length) {
    if (rawStatus.values.length === 1 && rawStatus.values[0] === "all") {
      status = "all";
    } else if (rawStatus.values.includes("all")) {
      invalid = true;
    } else {
      rawStatus.values.forEach((value) => {
        if ((Object.values(UserStatus) as string[]).includes(value)) {
          const parsedStatus = value as UserStatus;
          if (!statuses.includes(parsedStatus)) {
            statuses.push(parsedStatus);
          }
        } else {
          invalid = true;
        }
      });

      status = statuses[0] ?? "all";
    }
  }

  const rawAddedFrom = readSingle(input.addedFrom);
  const rawAddedTo = readSingle(input.addedTo);
  let addedFrom: string | null = null;
  let addedTo: string | null = null;
  if (rawAddedFrom.invalid || rawAddedTo.invalid) {
    invalid = true;
  } else {
    if (rawAddedFrom.value !== null) {
      if (isDateOnly(rawAddedFrom.value)) {
        addedFrom = rawAddedFrom.value;
      } else {
        invalid = true;
      }
    }

    if (rawAddedTo.value !== null) {
      if (isDateOnly(rawAddedTo.value)) {
        addedTo = rawAddedTo.value;
      } else {
        invalid = true;
      }
    }

    if (addedFrom && addedTo && addedFrom > addedTo) {
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

  const rawPageSize = readSingle(input.pageSize);
  let pageSize: DirectoryPageSize = DEFAULT_DIRECTORY_PAGE_SIZE;
  if (rawPageSize.invalid) {
    invalid = true;
  } else if (rawPageSize.value !== null) {
    if (!/^\d+$/u.test(rawPageSize.value)) {
      invalid = true;
    } else {
      const requestedPageSize = Number(rawPageSize.value);
      if (DIRECTORY_PAGE_SIZE_OPTIONS.includes(requestedPageSize as DirectoryPageSize)) {
        pageSize = requestedPageSize as DirectoryPageSize;
      } else {
        invalid = true;
      }
    }
  }

  const rawSort = readSingle(input.sort);
  let sort: DirectorySortKey | null = null;
  if (rawSort.invalid) {
    invalid = true;
  } else if (rawSort.value !== null) {
    if ((DIRECTORY_SORT_KEYS as readonly string[]).includes(rawSort.value)) {
      sort = rawSort.value as DirectorySortKey;
    } else {
      invalid = true;
    }
  }

  const rawDirection = readSingle(input.direction);
  let direction: DirectorySortDirection = "asc";
  if (rawDirection.invalid) {
    invalid = true;
  } else if (rawDirection.value !== null) {
    if (rawDirection.value === "asc" || rawDirection.value === "desc") {
      direction = rawDirection.value;
    } else {
      invalid = true;
    }

    if (!sort) {
      invalid = true;
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
    addedFrom,
    addedTo,
    focus,
    invalid,
    page,
    pageSize,
    search: invalid && search.length > MAX_DIRECTORY_QUERY_LENGTH ? "" : search,
    sort,
    direction,
    status,
    statuses,
  };
}

function parseDirectoryQuery(query: string): DirectoryParams {
  if (!query || query.length > 320 || !query.startsWith("?")) {
    return {
      addedFrom: null,
      addedTo: null,
      focus: null,
      invalid: Boolean(query),
      page: 1,
      pageSize: DEFAULT_DIRECTORY_PAGE_SIZE,
      search: "",
      sort: null,
      direction: "asc",
      status: "all",
      statuses: [],
    };
  }

  const params = new URLSearchParams(query.slice(1));
  const valueFor = (key: string): DirectoryParamValue => {
    const values = params.getAll(key);
    return values.length > 1 ? values : values[0];
  };

  return parseDirectoryParams({
    addedFrom: valueFor("addedFrom"),
    addedTo: valueFor("addedTo"),
    direction: valueFor("direction"),
    focus: valueFor("focus"),
    page: valueFor("page"),
    pageSize: valueFor("pageSize"),
    q: valueFor("q"),
    sort: valueFor("sort"),
    status: valueFor("status"),
  });
}

export {
  MAX_DIRECTORY_PAGE,
  MAX_DIRECTORY_QUERY_LENGTH,
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DIRECTORY_SORT_KEYS,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  isUuid,
  parseDirectoryParams,
  parseDirectoryQuery,
  parseUuid,
};
export { buildDirectoryQuery } from "./directory-query";
export type { DirectoryPageSize } from "./directory-page-constants";
export type {
  DirectoryQueryOptions,
  DirectorySortDirection,
  DirectorySortKey,
} from "./directory-query";
export type {
  DirectoryParams,
  DirectoryParamsInput,
  DirectoryParamValue,
};
