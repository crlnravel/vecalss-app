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
  const [resolvedSearchParams, tokenStatus] = await Promise.all([
    searchParams,
    getResetTokenStatus(token),
  ]);
  const audience = resolvedSearchParams.audience === "admin"
    ? "admin"
    : resolvedSearchParams.audience === "tutor"
      ? "tutor"
      : resolvedSearchParams.audience === "affiliator"
        ? "affiliator"
      : "student";

  return <ResetPasswordPageModule audience={audience} isValid={tokenStatus.isValid} token={token} />;
}
