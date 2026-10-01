"use client";

import { useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

import { Checkbox } from "@/components/ui/checkbox";
import { Sortable, SortableHandle, SortableItem } from "@/components/ui/sortable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical } from "@/lib/icons";

const exampleItems = [
  { id: "linear", title: "Persamaan linear" },
  { id: "probability", title: "Peluang" },
  { id: "logic", title: "Logika dasar" },
];

export function SortablePreview() {
  const [items, setItems] = useState(exampleItems);
  const [disabled, setDisabled] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary-600">Geser pegangan untuk mengubah urutan. Dengan keyboard, tekan spasi, gunakan tombol panah, lalu tekan spasi lagi. Escape membatalkan pemindahan.</p>
      <div className="flex items-center gap-2">
        <Checkbox checked={disabled} id="sortable-preview-disabled" onCheckedChange={(checked) => setDisabled(checked === true)} />
        <label className="text-sm text-secondary-900" htmlFor="sortable-preview-disabled">Nonaktifkan pengurutan</label>
      </div>
      <Sortable
        disabled={disabled}
        getItemLabel={(id) => items.find((item) => item.id === id)?.title ?? "Baris"}
        items={items.map((item) => item.id)}
        onReorder={(activeId, targetId) => setItems((current) => {
          const from = current.findIndex((item) => item.id === activeId);
          const to = current.findIndex((item) => item.id === targetId);
          return from < 0 || to < 0 ? current : arrayMove(current, from, to);
        })}
      >
        <ol aria-label="Contoh daftar yang dapat diurutkan" className="max-w-md space-y-2">
          {items.map((item, index) => (
            <SortableItem className="flex items-center gap-3 rounded-control border border-voyage-soft-border bg-voyage-surface p-2" key={item.id} render={<li />} value={item.id}>
              <Tooltip>
                <TooltipTrigger render={<SortableHandle aria-label={`Pindah ${item.title}`} className="max-md:size-11" />}><GripVertical aria-hidden="true" /></TooltipTrigger>
                <TooltipContent>Ubah urutan</TooltipContent>
              </Tooltip>
              <strong className="text-xs font-semibold tabular-nums text-secondary-900">{index + 1}</strong>
              <span className="text-xs text-secondary-900">{item.title}</span>
            </SortableItem>
          ))}
        </ol>
      </Sortable>
    </div>
  );
}
