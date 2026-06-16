import { redirectToAuthorizedHome, requireStudentSession } from "@/lib/auth/access";
import { ChangePasswordPageModule } from "@/modules/auth/ChangePasswordPageModule";

export default async function ChangePasswordPage() {
  const session = await requireStudentSession({
    allowIncompleteOnboarding: true,
    allowMustChangePassword: true,
  });

  if (!session.user.mustChangePassword) {
    redirectToAuthorizedHome(session.user);
  }

  return <ChangePasswordPageModule />;
}
