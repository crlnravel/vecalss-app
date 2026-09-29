import type { ReactNode } from "react";

function AdministrationActionRow({
  action,
  children,
  description,
}: {
  action: string;
  children: ReactNode;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-primary-100/70 py-5 last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-secondary-900">{action}</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-secondary-600">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center self-start md:self-center">
        {children}
      </div>
    </div>
  );
}

export { AdministrationActionRow };
