import { ResetPasswordPageModule } from "@/modules/auth/ResetPasswordPageModule";
import { getResetTokenStatus } from "@/modules/auth/actions";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenStatus = await getResetTokenStatus(token);

  return <ResetPasswordPageModule isValid={tokenStatus.isValid} token={token} />;
}
