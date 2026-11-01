import * as React from "react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { cn } from "@/lib/utils";

/** Thread with auto-scroll. It follows the reply while the reader stays at the live edge. */
function ChatThread({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
        <MessageScrollerViewport className="min-h-0 flex-1">
          <MessageScrollerContent className="flex flex-col gap-4 px-4 py-6">{children}</MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton className="absolute bottom-3 left-1/2 -translate-x-1/2" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

/** One turn. The person's own turns anchor the scroll position when they send. */
function ChatTurn({
  messageId,
  fromUser,
  children,
}: {
  messageId: string;
  fromUser: boolean;
  children: React.ReactNode;
}) {
  return (
    <MessageScrollerItem messageId={messageId} scrollAnchor={fromUser}>
      {children}
    </MessageScrollerItem>
  );
}

export { ChatThread, ChatTurn };
