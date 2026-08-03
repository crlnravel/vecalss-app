# Local Materi demo PDF fixture

The guarded Materi seed uses the supplied `tmp/test.pdf` as the source for all
21 temporary units. The file is gitignored and must not be edited, copied over,
or deleted by the seed operation.

During local development, `app/api/materi-demo/[filename]/route.ts` reads that
file at request time and serves it at:

```text
http://localhost:5023/api/materi-demo/test.pdf
```

The route is development-only; production mode returns `404`. Applying the
reset requires an explicit URL so a deployment database cannot silently store
`localhost` links. For the local demo database, run the app on port 5023 and
use:

```text
MATERI_DEMO_PDF_URL=http://localhost:5023/api/materi-demo/test.pdf \
MATERI_ALLOW_LOCAL_PDF_URL=1 \
MATERI_SEED_TUTOR_EMAIL=your-tutor@example.com \
pnpm db:apply-materi-reset -- --confirm=RESET_CANONICAL_MATERI_DEMO_ONLY
```

For a shared/deployment database, provide a reachable HTTPS `.pdf` URL with
`MATERI_DEMO_PDF_URL`; do not set `MATERI_ALLOW_LOCAL_PDF_URL`. The existing
hosted-PDF contract accepts the `.pdf` route and the explicit
`application/pdf` resource metadata. A base URL is still available for
read-only preflight and normal fresh-database seed use, but is not accepted as
the apply-time deployment URL.

The route is only a local demo fixture. Managed or hosted production documents
continue through the normal Kapten/student-safe document delivery flow.
