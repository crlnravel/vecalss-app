type FormState = {
  fieldErrors?: Record<string, string>;
  fields?: Record<string, string>;
  hasUnpublishedChanges?: boolean;
  handoffId?: string;
  inviteUrl?: string;
  handoffMethod?: "invite_link" | "temporary_password";
  message?: string;
  /** Where to go after the one-time recovery codes have been saved. */
  nextPath?: string;
  published?: boolean;
  /** Shown once, straight after enrollment; never stored in readable form. */
  recoveryCodes?: string[];
  resetUrl?: string;
  status: "error" | "idle" | "success";
  temporaryPassword?: string;
  userId?: string;
  /** Sign-in was refused only because the email is not verified yet: offer to send the link again. */
  verificationNeeded?: boolean;
  /** Outside production only: the verification link, shown on screen because no mailbox is involved. */
  verifyUrl?: string;
};

const EMPTY_FORM_STATE: FormState = {
  status: "idle",
};

export { EMPTY_FORM_STATE };
export type { FormState };
