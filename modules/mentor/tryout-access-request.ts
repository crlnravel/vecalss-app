import { withTryoutRequestDeadline } from "./tryout-request-recovery";

type AccessResponse<T> = { ok: true; result: T } | { ok: false; message: string; outcomeUnknown?: boolean };

/** A committed command remains successful when its subsequent projection fails. */
export async function performTryoutAccess<T, V>(command: () => Promise<AccessResponse<T>>, refresh: () => Promise<AccessResponse<V>>, milliseconds = 20_000) {
  let response: AccessResponse<T>;
  try { response = await withTryoutRequestDeadline(command(), milliseconds); }
  catch { return { state: "unknown" as const }; }
  if (!response.ok) return response.outcomeUnknown
    ? { state: "unknown" as const }
    : { state: "refused" as const, message: response.message };
  try {
    const projected = await withTryoutRequestDeadline(refresh(), milliseconds);
    return projected.ok
      ? { state: "saved" as const, receipt: response.result, view: projected.result }
      : { state: "saved" as const, receipt: response.result, view: null };
  } catch { return { state: "saved" as const, receipt: response.result, view: null }; }
}
