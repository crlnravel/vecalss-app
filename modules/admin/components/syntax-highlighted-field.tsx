"use client";

import { useRef, useState } from "react";

import { FieldInput, FieldTextarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const TOKEN_PATTERN = /(\{(?:firstName|target)\})/g;

function HighlightedText({ value }: { value: string }) {
  return value.split(TOKEN_PATTERN).map((part, index) => {
    const isToken = /^\{(?:firstName|target)\}$/.test(part);

    return isToken ? (
      <span className="rounded bg-primary-100 px-0.5 text-primary-800" key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part || "\u200b"}</span>
    );
  });
}

function SyntaxMirror({
  multiline,
  value,
}: {
  multiline: boolean;
  value: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl border border-transparent bg-white px-5 py-3.5 text-sm leading-6 text-secondary-900",
        multiline ? "min-h-[190px] whitespace-pre-wrap break-words" : "whitespace-pre",
      )}
    >
      <HighlightedText value={value} />
    </div>
  );
}

function SyntaxHighlightedInput({
  className,
  defaultValue = "",
  ...props
}: React.ComponentProps<typeof FieldInput>) {
  const [value, setValue] = useState(typeof defaultValue === "string" ? defaultValue : "");

  return (
    <div className="relative">
      <SyntaxMirror multiline={false} value={value} />
      <FieldInput
        {...props}
        className={cn("relative z-10 bg-transparent text-transparent caret-secondary-900 selection:bg-primary-200/60 selection:text-transparent", className)}
        onChange={(event) => {
          setValue(event.target.value);
          props.onChange?.(event);
        }}
        value={value}
      />
    </div>
  );
}

function SyntaxHighlightedTextarea({
  className,
  defaultValue = "",
  ...props
}: React.ComponentProps<typeof FieldTextarea>) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(typeof defaultValue === "string" ? defaultValue : "");

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-0 min-h-[190px] overflow-hidden rounded-2xl border border-transparent bg-white px-5 py-3.5 text-sm leading-6 text-secondary-900",
          className,
        )}
        ref={mirrorRef}
      >
        <HighlightedText value={value} />
      </div>
      <FieldTextarea
        {...props}
        className={cn("relative z-10 bg-transparent text-transparent caret-secondary-900 selection:bg-primary-200/60 selection:text-transparent", className)}
        onChange={(event) => {
          setValue(event.target.value);
          props.onChange?.(event);
        }}
        onScroll={(event) => {
          if (mirrorRef.current) {
            mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
          }
          props.onScroll?.(event);
        }}
        value={value}
      />
    </div>
  );
}

export { SyntaxHighlightedInput, SyntaxHighlightedTextarea };
