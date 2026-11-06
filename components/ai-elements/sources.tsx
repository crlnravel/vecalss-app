import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { VeraSource } from "@/lib/vera/sources/types";

const TYPE_LABELS: Record<VeraSource["type"], string> = { materi: "Materi", kuis: "Kuis", tryout: "Tryout", studio: "Studio" };

/**
 * The pages an answer drew on. Each chip opens the student's own lesson or result. The chips wrap inside the column, and a long
 * label ends in an ellipsis rather than running past the edges.
 */
function Sources({ sources }: { sources: VeraSource[] }) {
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-2">
      {sources.map((source) => (
        <Link className="min-w-0 max-w-full" href={source.href} key={`${source.type}:${source.id}`}>
          <Badge className="max-w-full min-w-0 shrink" size="sm" tone="info">
            <span className="min-w-0 truncate">
              {TYPE_LABELS[source.type]}: {source.label}
            </span>
          </Badge>
        </Link>
      ))}
    </div>
  );
}

export { Sources };
