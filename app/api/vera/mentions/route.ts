import { z } from "zod";

import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { serverLogger } from "@/lib/server-logger";
import { takeMentionSearch } from "@/lib/vera/mention-throttle";
import { searchMentions } from "@/lib/vera/sources/mentions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

const querySchema = z.object({ q: z.string().trim().max(80).default("") });

/** The `@` menu's candidates, grouped by Materi, Kuis and Tryout. */
export async function GET(request: Request) {
  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { code: "unauthenticated", message: "Masuk dulu untuk menyebut sumber." },
      { headers: responseHeaders, status: 401 },
    );
  }
  if (!hasRole(session, RoleName.student)) {
    return Response.json(
      { code: "forbidden", message: "Sumber Vera hanya tersedia untuk siswa." },
      { headers: responseHeaders, status: 403 },
    );
  }

  // The search reads the catalogue, so a student who has used up the minute's searches waits before the next one.
  if (!takeMentionSearch(session.user.id)) {
    return Response.json(
      { code: "rate_limited", message: "Pencarian terlalu sering. Tunggu sebentar, lalu coba lagi." },
      { headers: { ...responseHeaders, "Retry-After": "60" }, status: 429 },
    );
  }

  const parsed = querySchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return Response.json(
      { code: "invalid_request", message: "Pencarian belum bisa dibaca. Coba tulis ulang." },
      { headers: responseHeaders, status: 400 },
    );
  }

  try {
    const groups = await searchMentions({ studentId: session.user.id, query: parsed.data.q });
    return Response.json(groups, { headers: responseHeaders });
  } catch (error) {
    serverLogger.error("vera.mentions.search_failed", error, { area: "vera", operation: "search_mentions" });
    return Response.json(
      { code: "vera_unavailable", message: "Sumber belum dapat dicari. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}
