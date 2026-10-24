// A timed-out request keeps its transport fence until it actually settles.
// Recovery never dispatches a second request behind a hung Server Action.
export function createSingleFlightRead<T>(read: () => Promise<T>, timeoutMs = 10_000) {
  let pending: Promise<T> | null = null;
  return function readOnce(): Promise<T> {
    if (pending) return pending;
    let timeout: ReturnType<typeof setTimeout>;
    const result = new Promise<T>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Attempt state read timed out")), timeoutMs);
      void Promise.resolve().then(read).then(resolve, reject).finally(() => {
        clearTimeout(timeout);
        if (pending === result) pending = null;
      });
    });
    pending = result;
    return result;
  };
}
