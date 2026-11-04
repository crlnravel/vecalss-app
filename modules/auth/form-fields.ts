/** A text field with surrounding whitespace removed: email addresses, tokens and the like. */
function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A password or its confirmation, exactly as typed. Passwords are never trimmed
 * or normalized (see lib/auth/password-policy.mjs), so what is stored and what
 * must be typed at the next sign-in are the same bytes whatever the invite,
 * reset and change forms did with them.
 */
function readPasswordField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export { readPasswordField, readTextField };
