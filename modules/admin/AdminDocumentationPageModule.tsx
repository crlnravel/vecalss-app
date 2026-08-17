import Link from "next/link";

import AdminDocumentationContent from "@/content/admin-documentation.mdx";
import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

function AdminDocumentationPageModule({ session }: { session: SessionContext }) {
  return (
    <PortalShell
      activeAdminSection="docs"
      audience="admin"
      description="Product documentation for the administrator workspace."
      session={session}
      title="Administrator documentation"
    >
      <div className="mx-auto grid max-w-6xl gap-8 xl:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-primary-100 bg-white p-4 shadow-[0_18px_45px_-38px_rgba(1,76,56,0.6)] xl:sticky xl:top-24">
          <p className="px-3 text-xs font-semibold uppercase tracking-[0.15em] text-secondary-500">Documentation</p>
          <nav aria-label="Documentation sections" className="mt-3">
            <ul className="space-y-1 text-sm">
              <li>
                <a className="block rounded-xl bg-primary-50 px-3 py-2 font-semibold text-primary-900" href="#student-banners">
                  Student banners
                </a>
              </li>
              <li>
                <a className="block rounded-xl px-3 py-2 font-medium text-secondary-700 transition hover:bg-secondary-50 hover:text-secondary-950" href="#placeholders">
                  Placeholders
                </a>
              </li>
              <li>
                <a className="block rounded-xl px-3 py-2 font-medium text-secondary-700 transition hover:bg-secondary-50 hover:text-secondary-950" href="#publishing-checklist">
                  Publishing checklist
                </a>
              </li>
            </ul>
          </nav>

          <div className="mt-6 border-t border-primary-100 px-3 pt-4">
            <p className="text-xs leading-5 text-secondary-500">Need to make a content change?</p>
            <Link className="mt-2 inline-flex text-sm font-semibold text-primary-800 underline decoration-primary-200 underline-offset-4 hover:text-primary-950" href="/admin/student-banners">
              Open banner editor
            </Link>
          </div>
        </aside>

        <article className="min-w-0 rounded-3xl border border-primary-100 bg-white px-5 py-8 shadow-[0_22px_55px_-44px_rgba(1,76,56,0.55)] sm:px-10 sm:py-11">
          <div className="mb-8 border-b border-primary-100 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Administrator guide</p>
          </div>
          <AdminDocumentationContent />
        </article>
      </div>
    </PortalShell>
  );
}

export { AdminDocumentationPageModule };
