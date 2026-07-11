import { ResetPasswordPageModule } from "@/modules/auth/ResetPasswordPageModule";
import { getResetTokenStatus } from "@/modules/auth/actions";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const tokenStatus = await getResetTokenStatus(token);
  const audience = resolvedSearchParams.audience === "admin"
    ? "admin"
    : resolvedSearchParams.audience === "tutor"
      ? "tutor"
      : "student";

  return <ResetPasswordPageModule audience={audience} isValid={tokenStatus.isValid} token={token} />;
}
