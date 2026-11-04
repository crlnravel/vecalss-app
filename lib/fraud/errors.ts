/** The caller is not allowed to do this. `code` says why, for the interface and for tests. */
type AuthorityFailure =
  | "mfa_required"
  | "not_admin"
  | "not_owner"
  | "owner_unset"
  | "unauthenticated";

class FraudAuthorityError extends Error {
  readonly code: AuthorityFailure;

  constructor(code: AuthorityFailure) {
    super(`Fraud action refused: ${code}.`);
    this.name = "FraudAuthorityError";
    this.code = code;
  }
}

/** Someone else changed the record first, or its state no longer allows the step. */
class FraudConflictError extends Error {
  readonly code: "already_blocked" | "appeal_exists" | "not_in_force" | "stale_version" | "wrong_state";

  constructor(code: FraudConflictError["code"], message: string) {
    super(message);
    this.name = "FraudConflictError";
    this.code = code;
  }
}

/** The input is not acceptable (missing reason, unknown identifier, protected account). */
class FraudValidationError extends Error {
  readonly code:
    | "invalid_duration"
    | "invalid_identifier"
    | "invalid_reason"
    | "not_found"
    | "protected_account";

  constructor(code: FraudValidationError["code"], message: string) {
    super(message);
    this.name = "FraudValidationError";
    this.code = code;
  }
}

/** A required server setting is missing, so the check cannot be trusted and must fail closed. */
class FraudConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FraudConfigError";
  }
}

export { FraudAuthorityError, FraudConfigError, FraudConflictError, FraudValidationError };
export type { AuthorityFailure };
