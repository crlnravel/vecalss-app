const DIRECTORY_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_DIRECTORY_PAGE_SIZE = 20;

type DirectoryPageSize = (typeof DIRECTORY_PAGE_SIZE_OPTIONS)[number];

export {
  DEFAULT_DIRECTORY_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE_OPTIONS,
};
export type { DirectoryPageSize };
