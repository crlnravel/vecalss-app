import { NextResponse, type NextRequest } from "next/server";

/**
 * Passes the page being requested to the server render as a request header, so
 * the guard that sends an admin to the two-step verification screen can bring
 * them back to the same page afterwards. The header is always overwritten here,
 * so a client cannot choose it, and the verification screen only accepts admin
 * paths from it.
 */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete("_rsc");

  const headers = new Headers(request.headers);
  headers.set("x-vecalss-return-path", `${url.pathname}${url.search}`);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin/:path*"],
};
