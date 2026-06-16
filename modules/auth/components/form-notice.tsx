import { cn } from "@/lib/utils";

function FormNotice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "danger" | "neutral" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm leading-6",
        tone === "danger" && "border-danger-200 bg-danger-50 text-danger-700",
        tone === "neutral" && "border-primary-100 bg-primary-50 text-secondary-900",
        tone === "success" && "border-primary-200 bg-primary-50 text-primary-800",
      )}
    >
      {children}
    </div>
  );
}

export { FormNotice };
