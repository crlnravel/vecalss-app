import { Brain } from "@/lib/icons";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceTitle,
} from "@/components/ui/trace";

/**
 * Collapsible summary of the model's reasoning. It stays folded in both states: the title says Vera is thinking while the answer
 * streams, and the text opens only when the student asks for it.
 */
function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceIcon>
            <Brain />
          </TraceIcon>
          <TraceTitle>{streaming ? "Vera sedang berpikir…" : "Lihat proses berpikir"}</TraceTitle>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <TraceDescription className="whitespace-pre-wrap">{text}</TraceDescription>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}

export { Reasoning };
