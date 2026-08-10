type FormState = {
  fieldErrors?: Record<string, string>;
  fields?: Record<string, string>;
  handoffId?: string;
  inviteUrl?: string;
  handoffMethod?: "invite_link" | "temporary_password";
  message?: string;
  resetUrl?: string;
  status: "error" | "idle" | "success";
  temporaryPassword?: string;
};

const EMPTY_FORM_STATE: FormState = {
  status: "idle",
};

export { EMPTY_FORM_STATE };
export type { FormState };
