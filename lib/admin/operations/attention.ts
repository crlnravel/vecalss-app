import type { OperationsAttentionItem } from "./service";

function replaceReissuedHandoff(item: OperationsAttentionItem, replacementHandoffId: string) {
  return {
    ...item,
    id: replacementHandoffId,
    sourceImportId: null,
    sourceImportRowId: null,
    status: "released",
    statusLabel: "Awaiting acknowledgement",
  } satisfies OperationsAttentionItem;
}

function replaceReissuedAttentionItems(
  attention: OperationsAttentionItem[],
  itemId: string,
  replacementHandoffId: string,
) {
  return attention.map((item) => item.id === itemId ? replaceReissuedHandoff(item, replacementHandoffId) : item);
}

function removeResolvedAttentionItems(
  attention: OperationsAttentionItem[],
  resolvedIds: ReadonlySet<string>,
) {
  return attention.filter((item) => !resolvedIds.has(item.id));
}

export {
  removeResolvedAttentionItems,
  replaceReissuedAttentionItems,
  replaceReissuedHandoff,
};
