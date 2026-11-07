"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";

/**
 * The one renderer for Vera's markdown: chat answers, Studio previews and saved documents. Every element takes its style from the
 * design tokens below, so a link, a heading or a table reads the same wherever it appears. Math is rendered with KaTeX.
 */

const LINK =
  "rounded-indicator font-semibold text-voyage-deep underline decoration-voyage-leaf/60 underline-offset-4 transition-colors hover:decoration-voyage-deep focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none";
const HEADING_2 =
  "mt-5 font-heading text-[1.125rem] leading-tight font-extrabold tracking-[-0.035em] text-voyage-ink first:mt-0";
const HEADING_3 = "mt-4 font-heading text-base leading-snug font-extrabold tracking-[-0.025em] text-voyage-ink first:mt-0";
const PARAGRAPH = "mt-3 first:mt-0";
const UNORDERED = "my-3 list-disc space-y-1.5 pl-5 marker:text-voyage-leaf first:mt-0 last:mb-0";
const ORDERED = "my-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-voyage-deep first:mt-0 last:mb-0";
const QUOTE = "my-3 rounded-control bg-accent px-4 py-3 text-accent-foreground first:mt-0 last:mb-0";
const CODE = "rounded-indicator bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground";
const PRE =
  "my-3 overflow-x-auto rounded-control border border-border bg-muted p-3 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0";
const TABLE_FRAME = "my-3 max-w-full overflow-x-auto rounded-control border border-border";
const TABLE = "w-full min-w-max border-collapse text-sm";
const CELL = "border-b border-border px-3 py-2 align-top";
const HEAD_CELL = "border-b border-border bg-muted px-3 py-2 text-left font-semibold text-foreground";

const components: Components = {
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    if (href.startsWith("/")) {
      return (
        <Link className={LINK} href={href}>
          {children}
        </Link>
      );
    }
    return (
      <a className={LINK} href={href} rel="noopener noreferrer" target="_blank">
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => <blockquote className={QUOTE}>{children}</blockquote>,
  code: ({ children, className }) => <code className={cn(CODE, className)}>{children}</code>,
  h2: ({ children }) => <h2 className={HEADING_2}>{children}</h2>,
  h3: ({ children }) => <h3 className={HEADING_3}>{children}</h3>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => <ol className={ORDERED}>{children}</ol>,
  p: ({ children }) => <p className={PARAGRAPH}>{children}</p>,
  pre: ({ children }) => <pre className={PRE}>{children}</pre>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  table: ({ children }) => (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>{children}</table>
    </div>
  ),
  td: ({ children }) => <td className={CELL}>{children}</td>,
  th: ({ children }) => <th className={HEAD_CELL}>{children}</th>,
  ul: ({ children }) => <ul className={UNORDERED}>{children}</ul>,
};

/** Markdown from a model or from a saved document. It is rendered as elements, never as raw HTML. */
export function VeraMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("min-w-0 break-words", className)}>
      <ReactMarkdown
        components={components}
        rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
