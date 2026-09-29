export type CreateVeraConversation = () => Promise<string | null>;

export function createVeraConversationResolver() {
  let pendingCreation: Promise<string | null> | null = null;

  return (
    activeConversationId: string | null,
    createConversation: CreateVeraConversation,
  ): Promise<string | null> => {
    if (activeConversationId) {
      return Promise.resolve(activeConversationId);
    }

    if (pendingCreation) {
      return pendingCreation;
    }

    const creation = Promise.resolve().then(createConversation);
    pendingCreation = creation;
    const clearPendingCreation = () => {
      if (pendingCreation === creation) {
        pendingCreation = null;
      }
    };
    void creation.then(clearPendingCreation, clearPendingCreation);

    return creation;
  };
}
