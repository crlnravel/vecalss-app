import Link from "next/link";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { fieldControlClassName } from "@/components/ui/field-constants";
import type { EnrollmentHandoff, TutorProfile, User, UserStatus } from "@/generated/prisma/client";
import { buildDirectoryQuery } from "@/lib/admin/operations/validation";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { ActionButtonLink } from "@/modules/home/components/home-primitives";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import {
  deactivateKaptenEnrollmentAction,
  reactivateKaptenEnrollmentAction,
  updateKaptenEnrollmentAction,
} from "./actions";
import { CreateKaptenForm } from "./components/create-kapten-form";
import { FocusRestorer } from "./components/focus-restorer";
import { HandoffControls } from "./components/handoff-controls";

type EnrolledKapten = Pick<User, "createdAt" | "email" | "fullName" | "id" | "phone" | "status"> & {
  enrollmentHandoffs: Pick<EnrollmentHandoff, "expiresAt" | "id" | "method" | "sourceImportRowId" | "status">[];
  tutorProfile: Pick<TutorProfile, "bio" | "headline"> | null;
};

const noticeMessages: Record<string, string> = {
  "kapten-deactivated": "Kapten access has been disabled and active sessions were revoked.",
  "kapten-reactivated": "Kapten access has been restored without restoring old sessions or handoffs.",
  "kapten-updated": "Kapten profile details were updated.",
};

const errorMessages: Record<string, string> = {
  "duplicate-email": "That email is already being used by another account.",
  "invalid-directory-query": "That directory filter is invalid or too broad. The safe directory view has been restored.",
  "invalid-user": "That account identifier is invalid. Reload the directory and try again.",
  "missing-fields": "Please add the Kapten's name and email before updating.",
  "missing-user": "We couldn't find that Kapten account.",
  "update-failed": "We're sorry, we couldn't update that Kapten account. Please try again.",
};

function KaptenPageModule({
  error,
  focus,
  kapten,
  notice,
  page,
  pageCount,
  session,
  search,
  statusFilter,
  total,
}: {
  error?: string | null;
  focus?: string | null;
  kapten: EnrolledKapten[];
  notice?: string | null;
  page: number;
  pageCount: number;
  session: SessionContext;
  search: string;
  statusFilter: UserStatus | "all";
  total: number;
}) {
  const pageHref = (nextPage: number) => {
    const query = buildDirectoryQuery({ focus: null, page: nextPage, search, status: statusFilter });
    return query ? `/admin/kapten${query}` : "/admin/kapten";
  };
  const directoryQuery = buildDirectoryQuery({ focus: focus ?? null, page, search, status: statusFilter });

  return (
    <PortalShell
      activeAdminSection="kapten"
      audience="admin"
      description="Provision active Kapten accounts and maintain their bounded profile details without changing credentials or cohort assignments."
      title="Kapten enrollment"
      userLabel={session.user.fullName}
    >
      <div className="space-y-6">
        <FocusRestorer announcementId="kapten-directory-announcement" fallbackId="kapten-directory-heading" noticeId="kapten-directory-notice" targetId={focus ? `kapten-${focus}` : null} />
        <CreateKaptenForm />

        <p aria-live="polite" className="sr-only" id="kapten-directory-announcement">{focus ? "Returned to the selected Kapten directory row." : ""}</p>
        {notice ? <div id="kapten-directory-notice" tabIndex={-1}><FormNotice tone="success">{noticeMessages[notice] ?? notice}</FormNotice></div> : null}
        {error ? <FormNotice tone="danger">{errorMessages[error] ?? error}</FormNotice> : null}

        <section className="overflow-hidden rounded-5xl border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">Current Kapten</p>
              <h2 className="mt-2 text-2xl font-medium" id="kapten-directory-heading" tabIndex={-1}>Manage existing Kapten accounts</h2>
            </div>
            <p className="text-sm leading-6 text-secondary-600">Status changes revoke sessions and open handoffs; reactivation never restores either.</p>
          </div>

          <form className="mt-5 grid gap-3 rounded-3xl border border-primary-100 bg-primary-50/60 p-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end" method="get">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-secondary-900">Search Kapten</span>
              <input className={fieldControlClassName} defaultValue={search} name="q" placeholder="Name or email" type="search" />
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium text-secondary-900">Status</span>
              <select className={`${fieldControlClassName} pr-12`} defaultValue={statusFilter} name="status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="locked">Locked</option>
              </select>
            </label>
            <Button type="submit" variant="brand">Apply filters</Button>
          </form>

          <div className="mt-6 space-y-4">
            {kapten.length === 0 ? (
              <div className="parchment-panel rounded-5xl px-6 py-8 md:px-8 md:py-10">
                <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">Empty roster</p>
                <h3 className="mt-3 max-w-[16ch] text-2xl leading-tight font-medium text-secondary-900 md:text-3xl">{total === 0 ? "No Kapten accounts match this view." : "No Kapten match these filters."}</h3>
                <p className="mt-4 max-w-[58ch] text-sm leading-7 text-secondary-600 md:text-base">{total === 0 ? "Use the form above to create a tutor role and bounded profile, then deliver the one-time credential handoff." : "Try another name, email, or status filter to find the Kapten account you need."}</p>
                <div className="mt-6"><ActionButtonLink href="#create-kapten-account">Return to the create form</ActionButtonLink></div>
              </div>
            ) : kapten.map((person) => (
              <article
                className={cn("overflow-hidden rounded-4xl border border-primary-100 p-5", focus === person.id && "shadow-[0_0_0_2px_rgba(26,107,60,0.18)]")}
                data-directory-row="true"
                id={`kapten-${person.id}`}
                key={person.id}
                tabIndex={-1}
              >
                <form action={updateKaptenEnrollmentAction} className="grid min-w-0 gap-5 xl:grid-cols-3">
                  <input name="userId" type="hidden" value={person.id} />
                  <input name="directoryQuery" type="hidden" value={directoryQuery} />
                  <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Kapten name</span><input className={fieldControlClassName} defaultValue={person.fullName} name="fullName" required /></label>
                  <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Kapten email</span><input className={fieldControlClassName} defaultValue={person.email} name="email" required type="email" /></label>
                  <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Phone</span><input className={fieldControlClassName} defaultValue={person.phone ?? ""} name="phone" type="tel" /></label>
                  <label className="min-w-0 space-y-2 text-sm"><span className="font-medium text-secondary-900">Headline</span><input className={fieldControlClassName} defaultValue={person.tutorProfile?.headline ?? ""} name="headline" /></label>
                  <label className="min-w-0 space-y-2 text-sm xl:col-span-2"><span className="font-medium text-secondary-900">Bio</span><textarea className={`${fieldControlClassName} min-h-24 py-3`} defaultValue={person.tutorProfile?.bio ?? ""} name="bio" /></label>
                  <div className="flex justify-start md:justify-end xl:col-span-3"><Button type="submit" variant="brand">Save changes</Button></div>
                </form>

                <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-primary-50 px-4 py-3 text-sm leading-6 text-secondary-700 md:flex-row md:items-center md:justify-between">
                  <div><p className="font-medium text-secondary-900">Account state</p><p className="mt-1 capitalize">{person.status.replaceAll("_", " ")}</p><p className="mt-1">Active role: Kapten</p></div>
                  {person.status === "active" ? (
                    <form action={deactivateKaptenEnrollmentAction} className="space-y-3">
                      <input name="userId" type="hidden" value={person.id} />
                      <input name="directoryQuery" type="hidden" value={directoryQuery} />
                      <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                        <input className="mt-1" name="confirmation" required type="checkbox" value="deactivate" />
                        <span>I understand this disables the account, revokes active sessions, and invalidates open handoffs.</span>
                      </label>
                      <Button type="submit" variant="destructive">Deactivate</Button>
                    </form>
                  ) : person.status === "disabled" ? (
                    <form action={reactivateKaptenEnrollmentAction} className="space-y-3">
                      <input name="userId" type="hidden" value={person.id} />
                      <input name="directoryQuery" type="hidden" value={directoryQuery} />
                      <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
                        <input className="mt-1" name="confirmation" required type="checkbox" value="reactivate" />
                        <span>I understand reactivation does not restore old sessions or handoffs.</span>
                      </label>
                      <button className={buttonVariants({ variant: "brandOutline" })} type="submit">Reactivate</button>
                    </form>
                  ) : (
                    <p className="max-w-xs rounded-2xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-xs leading-5 text-secondary-600">
                      This account needs manual recovery before enrollment status can be changed.
                    </p>
                  )}
                </div>
                {person.enrollmentHandoffs[0] ? (
                  <HandoffControls
                    expiresAt={person.enrollmentHandoffs[0].expiresAt}
                    handoffId={person.enrollmentHandoffs[0].id}
                    method={person.enrollmentHandoffs[0].method}
                    sourceImportRowId={person.enrollmentHandoffs[0].sourceImportRowId ?? null}
                    status={person.enrollmentHandoffs[0].status}
                  />
                ) : null}

                <p className="mt-4 text-xs leading-6 text-secondary-500">Created on {person.createdAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-primary-100 pt-4 text-sm md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-secondary-600">Showing {kapten.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, (page - 1) * 20 + kapten.length)} of {total} Kapten</p>
            {pageCount > 1 ? (
              <nav aria-label="Kapten directory pages" className="flex items-center gap-2">
                {page > 1 ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page - 1)}>Previous</Link> : null}
                <span aria-current="page" className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-800">Page {page} of {pageCount}</span>
                {page < pageCount ? <Link className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })} href={pageHref(page + 1)}>Next</Link> : null}
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}

export { KaptenPageModule };
export type { EnrolledKapten };
