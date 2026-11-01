export type VeraErrorCode = "vera_unavailable" | "not_found" | "invalid_request";

export class VeraError extends Error {
  readonly code: VeraErrorCode;

  constructor(code: VeraErrorCode, message: string) {
    super(message);
    this.name = "VeraError";
    this.code = code;
  }
}

export const VERA_ERROR_STATUS: Record<VeraErrorCode, number> = {
  vera_unavailable: 503,
  not_found: 404,
  invalid_request: 400,
};
