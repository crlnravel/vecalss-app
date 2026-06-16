import { ForgotPasswordPageModule } from "@/modules/auth/ForgotPasswordPageModule";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const audience = resolvedSearchParams.audience === "admin" ? "admin" : "student";

  return <ForgotPasswordPageModule audience={audience} />;
}
