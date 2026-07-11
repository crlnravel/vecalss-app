import { redirectToAuthorizedHome, requireSession } from "@/lib/auth/access";
import { ChangePasswordPageModule } from "@/modules/auth/ChangePasswordPageModule";

export default async function ChangePasswordPage() {
  const session = await requireSession();

  if (!session.user.mustChangePassword) {
    redirectToAuthorizedHome(session.user);
  }

  return <ChangePasswordPageModule />;
}
