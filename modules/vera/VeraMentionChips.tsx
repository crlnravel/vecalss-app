import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { BookOpen, ClipboardList, FileText, ListChecks, X, type AppIcon } from "@/lib/icons";
import type { VeraMentionType } from "@/lib/vera/sources/types";
import type { MentionChip } from "@/modules/vera/mention-model";

const TYPE_ICONS: Record<VeraMentionType, AppIcon> = {
  materi: BookOpen,
  kuis: ClipboardList,
  tryout: ListChecks,
  studio: FileText,
};
const TYPE_LABELS: Record<VeraMentionType, string> = { materi: "Materi", kuis: "Kuis", tryout: "Tryout", studio: "Studio" };

/** The sources the student has pinned for this message. Each one can be taken off again before sending. */
export function VeraMentionChips({ chips, onRemove }: { chips: MentionChip[]; onRemove: (chip: MentionChip) => void }) {
  if (chips.length === 0) return null;
  return (
    <AttachmentGroup aria-label="Sumber yang disebut">
      {chips.map((chip) => {
        const Icon = TYPE_ICONS[chip.type];
        return (
          <Attachment className="max-w-full" key={`${chip.type}:${chip.id}`} size="sm">
            <AttachmentMedia>
              <Icon />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{chip.label}</AttachmentTitle>
              <AttachmentDescription>{TYPE_LABELS[chip.type]}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction aria-label={`Lepas ${chip.label}`} onClick={() => onRemove(chip)} type="button">
                <X />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        );
      })}
    </AttachmentGroup>
  );
}
