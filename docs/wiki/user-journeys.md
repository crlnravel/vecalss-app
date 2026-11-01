# Users, journeys, and routes

## Role model

| Role | Product name | Primary job | Route boundary |
| --- | --- | --- | --- |
| Student | Voyager | Learn, practise, take assessments, review progress, and use Vera AI | `/dashboard`, `/courses`, `/quiz`, `/tryout`, `/vera-ai`, `/settings`, `/notifications` |
| Tutor/content author | Kapten | Create, organise, review, and publish Materi, Kuis, Bank Soal, Tryout, and Media | `/mentor/*` |
| Administrator | Administrator | Manage enrollment/imports, notifications, audits, student preview, and AI operations | `/admin/*` |
| Referral partner | Affiliator | Share referral codes and review attributed package purchases | `/affiliator/*` |

Role names are product vocabulary, not a second authorization system. The
server uses Prisma roles and `lib/auth/access.ts` to enforce access.

## Canonical page route families

The following is a maintainer-facing map of canonical page route families from
the current `app/` tree at the wiki snapshot. Compatibility, archived, and redirect-only routes
are called out below rather than treated as active destinations. API route
handlers are listed separately.

### Public and account lifecycle

| Area | Routes |
| --- | --- |
| Public | `/`, `/faq`, `/top-alumni`, `/videos`, `/invite/[token]` |
| Authentication | `/login`, `/forgot-password`, `/reset-password/[token]`, `/change-password` |
| First access | `/onboarding` |

### Voyager learning loop

| Area | Routes |
| --- | --- |
| Home and account | `/dashboard`, `/settings`, `/notifications`, `/notifications/[notificationId]` |
| Materi | `/courses`, `/courses/[slug]`, `/courses/[slug]/[lessonId]` |
| Kuis | `/quiz`, `/quiz/[slug]`, `/quiz/[slug]/[quizSlug]`, `/quiz/[slug]/[quizSlug]/result` |
| Tryout | `/tryout`, `/tryout/[tryoutId]`, `/tryout/[tryoutId]/waiting`, `/tryout/attempt/[attemptId]`, `/tryout/attempt/[attemptId]/result` |
| Vera AI | `/vera-ai` |

`/tryout/[tryoutId]/register` is retained as a route-level compatibility
redirect. Student pages use `requireStudentSession` or the shared session
boundary before loading learner data.

### Affiliator workspace

| Area | Routes |
| --- | --- |
| Workspace | `/affiliator/dashboard`, `/affiliator/log-pembelian` |

`/affiliator` is a convenience redirect to the dashboard. Affiliator pages
use `requireAffiliatorSession`; purchase attribution is recorded against the
referral identity and succeeded package-purchase evidence.

### Kapten authoring workspace

| Area | Routes |
| --- | --- |
| Workspace | `/mentor/dashboard`, `/mentor/settings`, `/mentor/media` |
| Materi | `/mentor/materi`, `/mentor/materi/create`, `/mentor/materi/[materiId]`, `/mentor/materi/subject/[subjectSlug]` |
| Kuis | `/mentor/quiz`, `/mentor/quiz/create`, `/mentor/quiz/subject/[subjectSlug]`, `/mentor/quiz/[quizId]`, `/mentor/quiz/[quizId]/editor`, `/mentor/quiz/[quizId]/results/[attemptId]` |
| Bank Soal | `/mentor/quiz/question-bank`, `/mentor/quiz/question-bank/create`, `/mentor/quiz/question-bank/[bankId]`, `/mentor/quiz/question-bank/[bankId]/editor` |
| Tryout | `/mentor/tryout`, `/mentor/tryout/create`, `/mentor/tryout/[tryoutId]`, and the nested operations/session/participant routes under `/mentor/tryout/[tryoutId]/operations` |
| Reusable packages | `/mentor/packages`, `/mentor/packages/create`, `/mentor/packages/[packageId]`, `/mentor/packages/[packageId]/edit`, `/mentor/packages/[packageId]/use`, and version routes |

Kapten pages use `requireTutorSession`. Legacy Tryout package aliases and the
older operations URLs remain as redirects or compatibility surfaces where the
current workspace owns the canonical route.

### Route status notes

| Status | Examples | Meaning |
| --- | --- | --- |
| Canonical | `/mentor/tryout/[tryoutId]`, `/mentor/quiz/[quizId]`, `/admin/ai`, `/admin/ai/usage`, `/admin/affiliators`, `/admin/student-banners` | Active page destinations and current workspace entry points. |
| Redirect or compatibility | `/tryout/[tryoutId]/register`, `/admin/ai-usage`, `/admin/media` | Kept for existing links or migration compatibility; follow the redirect to the canonical surface. |
| Archived / not found | `/mentor/packages/*`, `/mentor/tryout/packages/*` | The route remains in the tree for compatibility, but its layout authenticates and returns `notFound()`; it is not an active authoring destination. |

### Administrator operations

| Area | Routes |
| --- | --- |
| Core operations | `/admin`, `/admin/enrollment`, `/admin/enrollment/[studentId]`, `/admin/notifications`, `/admin/audit-logs`, `/admin/kapten` |
| Imports | `/admin/imports/[importId]` plus the `/api/admin/imports/*` command and row endpoints |
| Student preview | `/admin/student-preview/[[...slug]]` |
| Vera AI cost view | `/admin/ai`, `/admin/ai/usage` |
| Growth and merchandising | `/admin/affiliators`, `/admin/student-banners` |

`/admin/ai-usage` redirects to `/admin/ai/usage`, and `/admin/media` is kept for
existing links. Administrator pages use `requireAdminSession`; read-only
preview reads use the dedicated admin read-only session boundary.

## API families

The current API tree includes:

- Enrollment/import/handoff commands under `/api/admin/*`. The Vera cost view
  has no API of its own: its pages read `lib/admin/ai-usage/`.
- Student-banner, purchase-attribution, Materi document/progress,
  notifications, media preview/thumbnail, invite, health, and scalability
  endpoints.
- Vera AI endpoints under `/api/vera/*`: `chat` (the streamed answer),
  `conversations` (list, rename, archive, delete), `mentions` (the `@` menu),
  `studio` (the documents list and runs, with `studio/[id]` to read or delete
  one), and `usage` (the day, week, and month balance).

API handlers should be read together with their `lib/` service and access
boundary. The route name alone is not a permission contract.

## Journey map

```mermaid
flowchart TD
    Login[Sign in] --> Gate{Onboarding or\npassword change needed?}
    Gate -->|Yes| Setup[Onboarding / change password]
    Gate -->|No| Home[Voyager dashboard]
    Setup --> Home
    Home --> Learn[Open Materi]
    Learn --> Practice[Take Kuis]
    Practice --> Assess[Register or start Tryout]
    Assess --> Review[Review result and next step]
    Review --> Learn
    Home --> Vera[Ask Vera AI or open Studio]

    KaptenLogin[Kapten sign in] --> Workspace[Resume authoring]
    Workspace --> Content[Materi / Kuis / Bank Soal / Tryout / Media]
    Content --> Publish[Review, schedule, publish]
    Publish --> Learn

    AdminLogin[Admin sign in] --> Ops[Enrollment / imports / audit]
    AdminLogin --> Control[AI usage / reliability / providers / policy]
    AdminLogin --> Preview[Fixed-subject student preview]
```
