import { ForgotPasswordPageModule } from "@/modules/auth/ForgotPasswordPageModule";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const audience = resolvedSearchParams.audience === "admin"
    ? "admin"
    : resolvedSearchParams.audience === "tutor"
      ? "tutor"
      : resolvedSearchParams.audience === "affiliator"
        ? "affiliator"
      : "student";
  const defaultEmail = typeof resolvedSearchParams.email === "string"
    ? resolvedSearchParams.email
    : undefined;

  return <ForgotPasswordPageModule audience={audience} defaultEmail={defaultEmail} />;
}
