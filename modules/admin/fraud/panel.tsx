import type { ReactNode } from "react";

/** The white card every section of the fraud and order pages sits in. Kept apart so a section can render without the page shell. */
function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mb-6 rounded-card border border-primary-100 bg-white p-4 sm:p-5">
      <h2 className="mb-3 font-heading text-base font-semibold text-secondary-900">{title}</h2>
      {children}
    </section>
  );
}

export { Panel };
