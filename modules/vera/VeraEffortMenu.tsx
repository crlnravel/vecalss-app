import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/lib/icons";
import { VERA_EFFORT_IDS, VERA_EFFORTS, type VeraEffortId } from "@/lib/vera/config";

/** Thinking level. Each level shows a one-line hint, and the choice applies to the next answer. */
export function VeraEffortMenu({ value, onChange }: { value: VeraEffortId; onChange: (next: VeraEffortId) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Mode berpikir: ${VERA_EFFORTS[value].label}`} render={<Button variant="outline" />}>
        {VERA_EFFORTS[value].label}
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          onValueChange={(next) => onChange(next as VeraEffortId)}
          value={value}
        >
          {VERA_EFFORT_IDS.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{VERA_EFFORTS[id].label}</span>
                <span className="text-xs text-muted-foreground">
                  {VERA_EFFORTS[id].hint} Maks {VERA_EFFORTS[id].ceilingCredits} kredit per jawaban.
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
