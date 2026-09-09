type ExistingCatAnswer = { selectedOptionId: string | null } | undefined;

type CatAnswerDecisionInput = {
  activeItemId: string | null;
  existingAnswer: ExistingCatAnswer;
  itemId: string;
  requestedOptionId: string | null;
  selectedItemIds: readonly string[];
};

type SealedCatRetryInput = {
  attemptStatus: string;
  availableUntil: Date;
  catItemCount: number | null;
  catState: string;
  deliverySessionStatus: string;
  itemId: string;
  now: Date;
  runSealedAt: Date | null;
  runServerDeadlineAt: Date | null;
  runStatus: string;
  selectedItemIds: readonly string[];
  updateCount: number;
};

type ActiveCatRetryInput = {
  attemptStatus: string;
  availableUntil: Date;
  catState: string;
  deliverySessionStatus: string;
  itemId: string;
  now: Date;
  runServerDeadlineAt: Date | null;
  runStatus: string;
  selectedItemIds: readonly string[];
};

type CatAnswerDecision = "accept" | "backtrack" | "conflict" | "idempotent";

function authoritativeCatActiveItemId(selectedItemIds: readonly string[]) {
  return selectedItemIds.at(-1) ?? null;
}

function projectCatItems<T extends { id: string }>(items: readonly T[], selectedItemIds: readonly string[]) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  return selectedItemIds.flatMap((itemId) => {
    const item = itemsById.get(itemId);
    return item ? [item] : [];
  });
}

function decideCatAnswer(input: CatAnswerDecisionInput): CatAnswerDecision {
  if (input.existingAnswer) {
    if (!input.selectedItemIds.includes(input.itemId)) return "backtrack";
    return input.existingAnswer.selectedOptionId === input.requestedOptionId ? "idempotent" : "conflict";
  }
  return input.activeItemId === input.itemId
    && input.selectedItemIds.at(-1) === input.itemId
    && !input.selectedItemIds.slice(0, -1).includes(input.itemId)
    ? "accept"
    : "backtrack";
}

function canWriteActiveCatAnswer(input: ActiveCatRetryInput) {
  return input.attemptStatus === "in_progress"
    && input.deliverySessionStatus === "active"
    && input.runStatus === "active"
    && input.catState === "ready"
    && input.runServerDeadlineAt !== null
    && input.now.getTime() < input.availableUntil.getTime()
    && input.now.getTime() < input.runServerDeadlineAt.getTime()
    && input.selectedItemIds.includes(input.itemId);
}

function canRetrySealedCatAnswer(input: SealedCatRetryInput) {
  const attemptStillOwnsRun = input.attemptStatus === "in_progress"
    || input.attemptStatus === "submitted"
    || input.attemptStatus === "auto_submitted"
    || input.attemptStatus === "scored";
  return attemptStillOwnsRun
    && input.deliverySessionStatus === "active"
    && input.runStatus === "sealed"
    && input.catState === "ready"
    && input.catItemCount !== null
    && input.catItemCount > 0
    && input.updateCount >= input.catItemCount
    && input.runSealedAt !== null
    && input.runServerDeadlineAt !== null
    && input.runSealedAt.getTime() <= input.runServerDeadlineAt.getTime()
    && input.now.getTime() < input.availableUntil.getTime()
    && authoritativeCatActiveItemId(input.selectedItemIds) === input.itemId;
}

export {
  authoritativeCatActiveItemId,
  canWriteActiveCatAnswer,
  canRetrySealedCatAnswer,
  decideCatAnswer,
  projectCatItems,
};
