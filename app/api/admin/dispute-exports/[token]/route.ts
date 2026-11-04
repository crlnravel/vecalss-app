import { getSessionContext } from "@/lib/auth/session";
import { claimDisputeExport, logRefusedExport } from "@/lib/disputes/export";
import { FraudAuthorityError } from "@/lib/fraud/errors";
import { requireOwner } from "@/lib/fraud/authority";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * The one-use download link of a dispute export. The link alone is not enough:
 * the caller must also hold an owner session with a verified second factor, and
 * the packet is handed over once, within its few minutes. Anything else gets the
 * same plain answer, so the link cannot be probed.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getSessionContext();

  let owner;
  try {
    owner = requireOwner(session);
  } catch (error) {
    if (session && error instanceof FraudAuthorityError) {
      await logRefusedExport({ actorUserId: session.user.id, orderId: null, reason: `download_${error.code}` });
    }
    return new Response("Tidak diizinkan.", { headers: NO_STORE, status: 403 });
  }

  const claimed = await claimDisputeExport(owner, token);
  if (!claimed.ok) {
    return new Response("Tautan ini sudah dipakai atau sudah kedaluwarsa. Buat paket baru dari halaman pesanan.", {
      headers: NO_STORE,
      status: 410,
    });
  }

  return new Response(claimed.text, {
    headers: {
      ...NO_STORE,
      "Content-Disposition": `attachment; filename="${claimed.fileName}"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
