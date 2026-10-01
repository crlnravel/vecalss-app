const AUDIT_LOG_SORT_KEYS = ["event", "time", "user"] as const;
const AUDIT_LOG_TARGET_TYPES = [
  "cohort",
  "enrollment_handoff",
  "enrollment_import",
  "enrollment_import_row",
  "system_config",
  "user",
] as const;

const DEFAULT_AUDIT_LOG_SORT = "time" as const;
const DEFAULT_AUDIT_LOG_DIRECTION = "desc" as const;
const AUDIT_LOG_RANGES = ["all", "24h", "7d", "30d"] as const;
type AuditLogRange = (typeof AUDIT_LOG_RANGES)[number];
const MAX_AUDIT_LOG_PAGE = 1_000;
const MAX_AUDIT_LOG_QUERY_LENGTH = 120;

type AuditLogSortKey = (typeof AUDIT_LOG_SORT_KEYS)[number];
type AuditLogSortDirection = "asc" | "desc";
type AuditLogTargetType = (typeof AUDIT_LOG_TARGET_TYPES)[number];
type AuditLogParamValue = string | string[] | undefined | null;

type AuditLogParamsInput = {
  range?: AuditLogParamValue;
  direction?: AuditLogParamValue;
  page?: AuditLogParamValue;
  q?: AuditLogParamValue;
  sort?: AuditLogParamValue;
  targetType?: AuditLogParamValue;
};

type AuditLogParams = {
  range: AuditLogRange;
  direction: AuditLogSortDirection;
  invalid: boolean;
  page: number;
  query: string;
  sort: AuditLogSortKey;
  targetType: AuditLogTargetType | null;
};

type AuditLogQueryOptions = {
  range?: AuditLogRange;
  direction?: AuditLogSortDirection;
  page?: number;
  query?: string;
  sort?: AuditLogSortKey | null;
  targetType?: AuditLogTargetType | null;
};

function readSingle(value: AuditLogParamValue) {
  if (value === undefined || value === null) {
    return { invalid: false, value: null as string | null };
  }

  if (Array.isArray(value) || typeof value !== "string") {
    return { invalid: true, value: null as string | null };
  }

  return { invalid: false, value };
}

function parseAuditLogParams(input: AuditLogParamsInput): AuditLogParams {
  let invalid = false;
  const rawRange = readSingle(input.range);
  const range: AuditLogRange = AUDIT_LOG_RANGES.includes(rawRange.value as AuditLogRange)
    ? rawRange.value as AuditLogRange
    : "all";
  invalid ||= rawRange.invalid || (rawRange.value !== null && !AUDIT_LOG_RANGES.includes(rawRange.value as AuditLogRange));
  const rawQuery = readSingle(input.q);
  const query = rawQuery.value?.trim() ?? "";
  if (rawQuery.invalid || query.length > MAX_AUDIT_LOG_QUERY_LENGTH) {
    invalid = true;
  }

  const rawTargetType = readSingle(input.targetType);
  let targetType: AuditLogTargetType | null = null;
  if (rawTargetType.invalid) {
    invalid = true;
  } else if (rawTargetType.value !== null) {
    if ((AUDIT_LOG_TARGET_TYPES as readonly string[]).includes(rawTargetType.value)) {
      targetType = rawTargetType.value as AuditLogTargetType;
    } else {
      invalid = true;
    }
  }

  const rawSort = readSingle(input.sort);
  let sort: AuditLogSortKey = DEFAULT_AUDIT_LOG_SORT;
  if (rawSort.invalid) {
    invalid = true;
  } else if (rawSort.value !== null) {
    if ((AUDIT_LOG_SORT_KEYS as readonly string[]).includes(rawSort.value)) {
      sort = rawSort.value as AuditLogSortKey;
    } else {
      invalid = true;
    }
  }

  const rawDirection = readSingle(input.direction);
  let direction: AuditLogSortDirection = sort === DEFAULT_AUDIT_LOG_SORT
    ? DEFAULT_AUDIT_LOG_DIRECTION
    : "asc";
  if (rawDirection.invalid) {
    invalid = true;
  } else if (rawDirection.value !== null) {
    if (rawDirection.value === "asc" || rawDirection.value === "desc") {
      direction = rawDirection.value;
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
        page = Math.min(requestedPage, MAX_AUDIT_LOG_PAGE);
        invalid ||= requestedPage > MAX_AUDIT_LOG_PAGE;
      }
    }
  }

  return {
    range,
    direction,
    invalid,
    page,
    query: query.length > MAX_AUDIT_LOG_QUERY_LENGTH ? "" : query,
    sort,
    targetType,
  };
}

function buildAuditLogQuery({
  range = "all",
  direction = DEFAULT_AUDIT_LOG_DIRECTION,
  page = 1,
  query = "",
  sort = DEFAULT_AUDIT_LOG_SORT,
  targetType = null,
}: AuditLogQueryOptions = {}) {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (range !== "all") params.set("range", range);

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (targetType) {
    params.set("targetType", targetType);
  }

  if (sort && (sort !== DEFAULT_AUDIT_LOG_SORT || direction !== DEFAULT_AUDIT_LOG_DIRECTION)) {
    params.set("sort", sort);
    if (direction === "desc") {
      params.set("direction", direction);
    }
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function auditLogRangeStart(range: AuditLogRange, now = new Date()): Date | null {
  const days = { all: 0, "24h": 1, "7d": 7, "30d": 30 }[range];
  return days ? new Date(now.getTime() - days * 86_400_000) : null;
}

export {
  AUDIT_LOG_RANGES,
  auditLogRangeStart,
  AUDIT_LOG_SORT_KEYS,
  AUDIT_LOG_TARGET_TYPES,
  DEFAULT_AUDIT_LOG_DIRECTION,
  DEFAULT_AUDIT_LOG_SORT,
  buildAuditLogQuery,
  parseAuditLogParams,
};
export type {
  AuditLogRange,
  AuditLogParams,
  AuditLogParamsInput,
  AuditLogQueryOptions,
  AuditLogSortDirection,
  AuditLogSortKey,
  AuditLogTargetType,
};
