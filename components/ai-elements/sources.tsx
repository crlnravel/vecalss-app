import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { VeraSource } from "@/lib/vera/sources/types";

const TYPE_LABELS: Record<VeraSource["type"], string> = { materi: "Materi", kuis: "Kuis", tryout: "Tryout", studio: "Studio" };

/** The pages an answer drew on. Each chip opens the student's own lesson or result. */
function Sources({ sources }: { sources: VeraSource[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((source) => (
        <Link className="max-w-full min-w-0" href={source.href} key={`${source.type}:${source.id}`}>
          <Badge className="max-w-full min-w-0 truncate" size="sm" tone="info">
            {TYPE_LABELS[source.type]}: {source.label}
          </Badge>
        </Link>
      ))}
    </div>
  );
}

export { Sources };
