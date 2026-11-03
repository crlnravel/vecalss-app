import { AuthShell } from "./components/auth-shell";
import {
  ChallengeForms,
  EnrollmentScreen,
  SetupCodeForm,
  SignOutForm,
} from "./components/mfa-forms";
import { MFA_COPY } from "./mfa-copy";

type MfaPageModuleProps =
  | { kind: "challenge"; mode: "code" | "recovery"; returnTo: string | null }
  | { kind: "setup-code"; returnTo: string | null }
  | { kind: "scan"; manualKey: string; qrSvg: string; returnTo: string | null }
  | { kind: "unavailable" };

const EYEBROW = "Verifikasi dua langkah";

function MfaPageModule(props: MfaPageModuleProps) {
  if (props.kind === "unavailable") {
    return (
      <AuthShell
        description={MFA_COPY.unavailable.description}
        eyebrow={EYEBROW}
        title={MFA_COPY.unavailable.title}
      >
        <SignOutForm />
      </AuthShell>
    );
  }

  if (props.kind === "challenge") {
    const copy = props.mode === "recovery" ? MFA_COPY.recovery : MFA_COPY.challenge;
    return (
      <AuthShell description={copy.description} eyebrow={EYEBROW} title={copy.title}>
        <ChallengeForms mode={props.mode} returnTo={props.returnTo} />
      </AuthShell>
    );
  }

  if (props.kind === "setup-code") {
    return (
      <AuthShell description={MFA_COPY.setup.description} eyebrow={EYEBROW} title={MFA_COPY.setup.title}>
        <SetupCodeForm returnTo={props.returnTo} />
      </AuthShell>
    );
  }

  return <EnrollmentScreen manualKey={props.manualKey} qrSvg={props.qrSvg} returnTo={props.returnTo} />;
}

export { MfaPageModule };
