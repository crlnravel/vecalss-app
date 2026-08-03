import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_FILENAME = "test.pdf";

/**
 * Local-only delivery for the guarded demo seed. The route deliberately reads
 * the supplied, gitignored `tmp/test.pdf` without copying or mutating it.
 * Production/managed PDFs use the normal student-safe delivery route.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { filename } = await context.params;
  if (filename !== DEMO_FILENAME) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(join(process.cwd(), "tmp", DEMO_FILENAME));
    return new Response(bytes, {
      headers: {
        Accept: "application/pdf",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${DEMO_FILENAME}"`,
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "application/pdf",
      },
    });
  } catch {
    return new Response("The local Materi demo PDF fixture is unavailable.", { status: 404 });
  }
}
