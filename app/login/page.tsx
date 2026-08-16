import { LoginPageModule } from "@/modules/auth/LoginPageModule";
import { getSafeAdminReturnPath } from "@/lib/auth/paths";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = typeof resolvedSearchParams.notice === "string"
    ? resolvedSearchParams.notice
    : null;
  const returnTo = getSafeAdminReturnPath(resolvedSearchParams.returnTo);

  return <LoginPageModule notice={notice} returnTo={returnTo} />;
}
