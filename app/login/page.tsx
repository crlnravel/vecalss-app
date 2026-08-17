import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/session";
import { getDefaultHomePath, getSafeAdminReturnPath } from "@/lib/auth/paths";
import { LoginPageModule } from "@/modules/auth/LoginPageModule";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionContext();

  if (session) {
    const homePath = getDefaultHomePath(session.user);

    if (homePath !== "/login") {
      redirect(homePath);
    }
  }

  const resolvedSearchParams = await searchParams;
  const notice = typeof resolvedSearchParams.notice === "string"
    ? resolvedSearchParams.notice
    : null;
  const returnTo = getSafeAdminReturnPath(resolvedSearchParams.returnTo);

  return <LoginPageModule notice={notice} returnTo={returnTo} />;
}
