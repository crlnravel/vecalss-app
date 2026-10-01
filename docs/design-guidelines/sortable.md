# Sortable lists

Use `Sortable`, `SortableItem`, and `SortableHandle` from `components/ui/sortable.tsx` for user-controlled row ordering. They share `@dnd-kit/core` sensors and `@dnd-kit/sortable` behavior; pages should not implement their own drag listeners.

The root takes stable string IDs in their current display order and calls `onReorder(activeId, targetId)` after a completed drop. The caller owns ordering state, dirty-state handling, authorization, and saving. Cancellation and unchanged drops never call `onReorder`.

```tsx
import { arrayMove } from "@dnd-kit/sortable";
import { Sortable, SortableHandle, SortableItem } from "@/components/ui/sortable";
import { GripVertical } from "@/lib/icons";

<Sortable
  items={rows.map((row) => row.id)}
  disabled={!canEdit}
  getItemLabel={(id) => rows.find((row) => row.id === id)?.title ?? "Baris"}
  onReorder={(activeId, targetId) => setRows((current) => {
    const from = current.findIndex((row) => row.id === activeId);
    const to = current.findIndex((row) => row.id === targetId);
    return from < 0 || to < 0 ? current : arrayMove(current, from, to);
  })}
>
  <ol aria-label="Urutan materi">
    {rows.map((row) => (
      <SortableItem key={row.id} value={row.id} render={<li />}>
        <SortableHandle aria-label={`Pindah ${row.title}`}>
          <GripVertical aria-hidden="true" />
        </SortableHandle>
        <span>{row.title}</span>
      </SortableItem>
    ))}
  </ol>
</Sortable>
```

- Vertical lists are the default. Use `orientation="horizontal"` for horizontal lists; this primitive does not implement grid sorting or movement between lists.
- Keep IDs unique and stable. Render item children inside their item's context and preserve the parent markup using `render={<li />}` or `render={<tr />}`.
- Only the handle activates dragging. The handle uses the shared quiet Button and supports Tooltip composition through `render`. Other row controls retain their own actions.
- Pointer movement must exceed 4px before activation. Handles disable touch scrolling on their own hit area; the rest of the list can scroll normally. Dnd-kit handles scrolling during dragging.
- Keyboard users focus the handle, press Space or Enter to lift, use arrows to move, press Space or Enter to drop, and press Escape to cancel. The root supplies Indonesian instructions and announcements, and dnd-kit restores focus after a drag.
- Pass `disabled` on the root for a locked list, or on an item to lock an individual row. Handles inherit this state. Callers must also enforce authorization when committing or saving an order.
- The caller supplies row styling. Preserve visible focus, shared control sizes, 44px touch targets, and reduced-motion behavior. The item removes sorting transitions under reduced motion.

The developer component catalogue includes a working `Sortable` example with a disabled-state toggle. The quiz editor's inventory is the first product consumer.
