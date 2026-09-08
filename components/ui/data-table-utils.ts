import { cn } from "@/lib/utils";

function removeMinimumWidthClasses(className?: string) {
  return className
    ?.split(/\s+/)
    .filter((token) => !/(^|:)!?min-w-/.test(token))
    .join(" ");
}

export function resolveDataTableClassName({
  hasRows,
  isLoading,
  tableClassName,
}: {
  hasRows: boolean;
  isLoading: boolean;
  tableClassName?: string;
}) {
  const usesDenseMinimumWidth = hasRows || isLoading;
  const resolvedTableClassName = usesDenseMinimumWidth
    ? tableClassName
    : removeMinimumWidthClasses(tableClassName);

  return cn(
    usesDenseMinimumWidth ? "min-w-[760px]" : "min-w-full",
    "table-fixed border-separate border-spacing-y-0",
    resolvedTableClassName,
    !usesDenseMinimumWidth && "!min-w-full",
  );
}
