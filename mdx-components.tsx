import type { MDXComponents } from "mdx/types";

const components: MDXComponents = {
  a: ({ children, href, ...props }) => (
    <a
      className="font-medium text-primary-800 underline decoration-primary-200 underline-offset-4 transition hover:text-primary-950"
      href={href}
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-6 rounded-2xl border border-primary-100 bg-primary-50/60 px-5 py-4 text-secondary-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className, ...props }) => (
    <code
      className={className
        ? "font-mono text-[0.9em]"
        : "rounded-md bg-primary-50 px-1.5 py-0.5 font-mono text-[0.9em] text-primary-900"}
      {...props}
    >
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="text-3xl font-semibold tracking-[-0.04em] text-secondary-950 sm:text-4xl">
      {children}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2 className="mt-12 scroll-mt-28 text-2xl font-semibold tracking-[-0.03em] text-secondary-950 first:mt-0" id={id}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-8 text-lg font-semibold text-secondary-900">{children}</h3>
  ),
  hr: () => <hr className="my-10 border-primary-100" />,
  li: ({ children }) => <li className="pl-1 leading-7 text-secondary-700">{children}</li>,
  ol: ({ children }) => <ol className="my-5 list-decimal space-y-2 pl-6">{children}</ol>,
  p: ({ children }) => <p className="my-5 leading-7 text-secondary-700">{children}</p>,
  pre: ({ children }) => (
    <pre className="my-6 overflow-x-auto rounded-2xl bg-secondary-950 p-5 text-sm leading-7 text-secondary-50">
      {children}
    </pre>
  ),
  strong: ({ children }) => <strong className="font-semibold text-secondary-900">{children}</strong>,
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-2xl border border-primary-100">
      <table className="w-full min-w-[30rem] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-primary-100">{children}</tbody>,
  td: ({ children }) => <td className="px-4 py-3 text-secondary-700">{children}</td>,
  th: ({ children }) => <th className="bg-secondary-50 px-4 py-3 font-semibold text-secondary-900">{children}</th>,
  thead: ({ children }) => <thead>{children}</thead>,
  tr: ({ children }) => <tr>{children}</tr>,
  ul: ({ children }) => <ul className="my-5 list-disc space-y-2 pl-6">{children}</ul>,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
