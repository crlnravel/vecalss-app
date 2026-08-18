import { getTrustedAppBaseUrl } from "@/lib/admin/handoffs/envelope";
import { isDebugAccountSwitcherEnabled } from "@/lib/config";
import { getDefaultHomePath } from "@/lib/auth/paths";
import { getReadOnlySessionContext, switchSessionToUser } from "@/lib/auth/session";
import { getDebugAccountById, toAuthenticatedUser } from "@/lib/auth/debug-account-switcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

function unavailableResponse() {
  return Response.json({ error: "Not found" }, { headers: responseHeaders, status: 404 });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    return origin === getTrustedAppBaseUrl();
  } catch {
    return false;
  }
}

function readUserId(body: unknown) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const userId = (body as Record<string, unknown>).userId;
  return typeof userId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    ? userId
    : null;
}

export async function POST(request: Request) {
  if (!isDebugAccountSwitcherEnabled()) {
    return unavailableResponse();
  }

  if (!isSameOrigin(request)) {
    return Response.json(
      { error: "Permintaan tidak berasal dari aplikasi." },
      { headers: responseHeaders, status: 403 },
    );
  }

  const session = await getReadOnlySessionContext();
  if (!session) {
    return Response.json(
      { error: "Sesi kamu sudah berakhir. Masuk kembali untuk mengganti akun." },
      { headers: responseHeaders, status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Akun yang dipilih tidak valid." },
      { headers: responseHeaders, status: 400 },
    );
  }

  const userId = readUserId(body);
  if (!userId) {
    return Response.json(
      { error: "Akun yang dipilih tidak valid." },
      { headers: responseHeaders, status: 400 },
    );
  }

  const account = await getDebugAccountById(userId);
  if (!account) {
    return Response.json(
      { error: "Akun aktif tidak ditemukan." },
      { headers: responseHeaders, status: 404 },
    );
  }

  try {
    const nextSession = await switchSessionToUser(account.id);
    if (!nextSession) {
      return Response.json(
        { error: "Akun tersebut tidak dapat digunakan sekarang." },
        { headers: responseHeaders, status: 409 },
      );
    }

    const nextUser = toAuthenticatedUser(account);
    return Response.json(
      {
        account,
        destination: getDefaultHomePath(nextUser),
      },
      { headers: responseHeaders },
    );
  } catch {
    return Response.json(
      { error: "Akun belum dapat diganti. Coba lagi." },
      { headers: responseHeaders, status: 503 },
    );
  }
}
