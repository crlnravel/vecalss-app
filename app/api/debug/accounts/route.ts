import { isDebugAccountSwitcherEnabled } from "@/lib/config";
import { getReadOnlySessionContext } from "@/lib/auth/session";
import { getDebugAccounts } from "@/lib/auth/debug-account-switcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function unavailableResponse() {
  return Response.json({ error: "Not found" }, { headers: responseHeaders, status: 404 });
}

export async function GET() {
  if (!isDebugAccountSwitcherEnabled()) {
    return unavailableResponse();
  }

  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { error: "Masuk untuk mengganti akun." },
      { headers: responseHeaders, status: 401 },
    );
  }

  try {
    return Response.json(
      { accounts: await getDebugAccounts() },
      { headers: responseHeaders },
    );
  } catch {
    return Response.json(
      { error: "Daftar akun debug belum dapat dimuat." },
      { headers: responseHeaders, status: 503 },
    );
  }
}
