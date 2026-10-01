"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SortableProps = {
  children: ReactNode;
  disabled?: boolean;
  /** Stable IDs in their current display order. The caller owns persistence. */
  items: string[];
  onReorder: (activeId: string, targetId: string) => void;
  orientation?: "vertical" | "horizontal";
  getItemLabel?: (id: string) => string;
};

const SortableRootContext = createContext<{ disabled: boolean } | null>(null);
const SortableItemContext = createContext<ReturnType<typeof useSortable> & { disabled: boolean } | null>(null);

/** Controlled list sorting. See docs/design-guidelines/sortable.md. */
export function Sortable({ children, disabled = false, items, onReorder, orientation = "vertical", getItemLabel }: SortableProps) {
  const id = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const label = (itemId: string | number) => getItemLabel?.(String(itemId)) ?? `Baris ${items.indexOf(String(itemId)) + 1}`;
  const position = (itemId: string | number) => items.indexOf(String(itemId)) + 1;

  return (
    <SortableRootContext.Provider value={{ disabled }}>
      <DndContext
        id={id}
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{
          screenReaderInstructions: { draggable: "Tekan spasi untuk mengangkat baris. Gunakan tombol panah untuk memindahkannya. Tekan spasi lagi untuk meletakkan, atau Escape untuk membatalkan." },
          announcements: {
            onDragStart: ({ active }) => `${label(active.id)} diangkat. Posisi ${position(active.id)} dari ${items.length}.`,
            onDragOver: ({ active, over }) => over ? `${label(active.id)} menuju posisi ${position(over.id)} dari ${items.length}.` : undefined,
            onDragEnd: ({ active, over }) => over ? `${label(active.id)} diletakkan di posisi ${position(over.id)} dari ${items.length}.` : "Pemindahan dibatalkan.",
            onDragCancel: () => "Pemindahan dibatalkan.",
          },
        }}
        onDragEnd={({ active, over }) => {
          if (disabled || !over || active.id === over.id) return;
          if (typeof active.id !== "string" || typeof over.id !== "string") return;
          if (!items.includes(active.id) || !items.includes(over.id)) return;
          onReorder(active.id, over.id);
        }}
      >
        <SortableContext items={items} strategy={orientation === "vertical" ? verticalListSortingStrategy : horizontalListSortingStrategy}>
          {children}
        </SortableContext>
      </DndContext>
    </SortableRootContext.Provider>
  );
}

export type SortableItemProps = useRender.ComponentProps<"div"> & {
  value: string;
  disabled?: boolean;
};

/** Use render={<li />} or render={<tr />} to preserve the parent's semantics. */
export function SortableItem({ value, disabled = false, render, ...props }: SortableItemProps) {
  const root = useContext(SortableRootContext);
  if (!root) throw new Error("SortableItem must be rendered inside Sortable.");
  const isDisabled = root.disabled || disabled;
  const sortable = useSortable({ id: value, disabled: isDisabled });
  const element = useRender({
    defaultTagName: "div",
    render,
    ref: sortable.setNodeRef,
    props: mergeProps<"div">({
      style: { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition },
      className: "relative data-[dragging]:z-10 motion-reduce:transition-none!",
    }, props),
    state: { dragging: sortable.isDragging },
  });
  return <SortableItemContext.Provider value={{ ...sortable, disabled: isDisabled }}>{element}</SortableItemContext.Provider>;
}

/** Shared Button activator; compose with TooltipTrigger through render. */
export function SortableHandle({ className, disabled = false, render, size = "icon-sm", style, variant = "quiet", ...props }: ComponentProps<typeof Button>) {
  const item = useContext(SortableItemContext);
  if (!item) throw new Error("SortableHandle must be rendered inside SortableItem.");
  return useRender({
    defaultTagName: "button",
    render: <Button data-slot="sortable-handle" render={render} size={size} style={style} variant={variant} />,
    ref: item.setActivatorNodeRef,
    props: mergeProps<"button">(item.attributes, item.listeners, {
      ...props,
      disabled: item.disabled || disabled,
      className: cn("touch-none cursor-grab active:cursor-grabbing disabled:cursor-not-allowed", className),
    }),
  });
}
