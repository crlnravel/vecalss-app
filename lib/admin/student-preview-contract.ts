/**
 * A non-null preview purpose identifies a managed, non-human subject. Keep
 * this predicate in a server-agnostic module so lower-level services and
 * contract tests can enforce the invariant without importing the resolver's
 * `server-only` boundary.
 */
function isManagedPreviewPurpose(value: string | null | undefined): value is string {
  return typeof value === "string";
}

export { isManagedPreviewPurpose };
