import type { ReactNode } from "react";

type DocCalloutProps = {
  children: ReactNode;
  tone?: "info" | "warning";
};

const calloutStyles = {
  info: "border-primary-200 bg-primary-50 text-primary-950",
  warning: "border-warning-200 bg-warning-50 text-warning-950",
} as const;

function DocCallout({ children, tone = "info" }: DocCalloutProps) {
  return (
    <aside className={`my-7 rounded-2xl border px-5 py-4 text-sm leading-6 ${calloutStyles[tone]}`}>
      {children}
    </aside>
  );
}

export { DocCallout };
