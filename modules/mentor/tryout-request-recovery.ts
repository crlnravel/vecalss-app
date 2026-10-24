/** Bound UI busy states without treating an interrupted response as a failed write. */
export class TryoutRequestDeadlineError extends Error {}

export async function withTryoutRequestDeadline<T>(request: Promise<T>, milliseconds = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TryoutRequestDeadlineError("Tryout request outcome unavailable")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
