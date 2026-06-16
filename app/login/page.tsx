import { LoginPageModule } from "@/modules/auth/LoginPageModule";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const notice = typeof resolvedSearchParams.notice === "string"
    ? resolvedSearchParams.notice
    : null;

  return <LoginPageModule notice={notice} />;
}
