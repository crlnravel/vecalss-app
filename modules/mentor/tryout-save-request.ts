/** Keep an unanswered save attached to its original input. A retry reads the
 * same response instead of creating another Tryout after a UI deadline. */
export function createTryoutSaveRequest<Input, Output>() {
  let current: { input: Input; response: Promise<Output> } | null = null;
  return {
    getOrStart(input: Input, start: (input: Input) => Promise<Output>) {
      current ??= { input, response: start(input) };
      return current;
    },
    clear(request: { input: Input; response: Promise<Output> }) {
      if (current === request) current = null;
    },
  };
}

/** A receipt proves its own snapshot was saved, not later local edits. */
export function finishTryoutSave<Snapshot, Receipt>(options: {
  savedSnapshot: Snapshot;
  latestSnapshot: Snapshot;
  receipt: Receipt;
  onReceipt: (receipt: Receipt) => void;
  onLatestSaved: (receipt: Receipt) => void;
  onCreateNavigate?: (receipt: Receipt) => void;
}) {
  options.onReceipt(options.receipt);
  if (options.savedSnapshot !== options.latestSnapshot) return false;
  options.onLatestSaved(options.receipt);
  options.onCreateNavigate?.(options.receipt);
  return true;
}

export async function continueAfterTryoutSave(save: () => Promise<boolean>, navigate: () => void) {
  const latestSaved = await save();
  if (latestSaved) navigate();
  return latestSaved;
}
