"use client";

import { useMemo, useState } from "react";

import { history, historyKeymap } from "@codemirror/commands";
import CodeMirror, {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type Extension,
  type ViewUpdate,
} from "@uiw/react-codemirror";

import { cn } from "@/lib/utils";

const TOKEN_PATTERN = /\{(?:firstName|target)\}/g;
const TOKEN_DECORATION = Decoration.mark({ class: "cm-banner-token" });

const tokenHighlightExtension = ViewPlugin.fromClass(
  class {
    private readonly decorator = new MatchDecorator({
      decoration: TOKEN_DECORATION,
      regexp: TOKEN_PATTERN,
    });

    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = this.decorator.createDeco(view);
    }

    update(update: ViewUpdate) {
      this.decorations = this.decorator.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (value) => value.decorations,
  },
);

const editorClassName =
  "min-w-0 w-full overflow-hidden rounded-2xl border border-secondary-900/14 bg-white text-base text-secondary-900 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--voyage-surface)_65%,transparent)] outline-none transition-[border-color,box-shadow,background-color] focus-within:border-primary-700/40 focus-within:ring-4 focus-within:ring-primary-700/12";

function createEditorTheme(multiline: boolean) {
  return EditorView.theme({
    "&": {
      color: "var(--secondary-900)",
      fontFamily: "inherit",
      lineHeight: "1.5",
    },
    ".cm-content": {
      boxSizing: "border-box",
      fontFamily: "inherit",
      fontSize: "inherit",
      lineHeight: "1.5",
      padding: "14px 20px",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--secondary-900)",
    },
    ".cm-line": {
      padding: "0",
    },
    ".cm-scroller": {
      fontFamily: "inherit",
      overflow: multiline ? "auto" : "hidden",
    },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--primary-200) 60%, transparent)",
    },
    ".cm-banner-token": {
      backgroundColor: "var(--primary-100)",
      color: "var(--primary-800)",
    },
  });
}

type CodeMirrorFieldProps = Omit<
  React.ComponentProps<typeof CodeMirror>,
  "className" | "defaultValue" | "disabled" | "id" | "name" | "onChange" | "readOnly" | "required" | "value"
> & {
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  maxLength?: number;
  name?: string;
  onValueChange?: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  value?: string;
};

function useFieldValue({
  defaultValue,
  onValueChange,
  value,
}: Pick<CodeMirrorFieldProps, "defaultValue" | "onValueChange" | "value">) {
  const isControlled = value !== undefined;
  const normalizedDefaultValue = typeof defaultValue === "string" ? defaultValue : "";
  const [uncontrolledValue, setUncontrolledValue] = useState(normalizedDefaultValue);

  const currentValue = isControlled ? value ?? "" : uncontrolledValue;

  function handleValueChange(nextValue: string) {
    if (!isControlled) {
      setUncontrolledValue(nextValue);
    }
    onValueChange?.(nextValue);
  }

  return { currentValue, handleValueChange };
}

function CodeMirrorField({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-required": ariaRequired,
  className,
  defaultValue = "",
  disabled = false,
  id,
  maxLength,
  name,
  onValueChange,
  readOnly = false,
  required = false,
  value,
  multiline,
  ...props
}: CodeMirrorFieldProps & { multiline: boolean }) {
  const { currentValue, handleValueChange } = useFieldValue({ defaultValue, onValueChange, value });
  const editorExtensions = useMemo<Extension[]>(() => {
    const contentAttributes: Record<string, string> = {
      ...(id ? { id } : {}),
      ...(ariaDescribedBy ? { "aria-describedby": ariaDescribedBy } : {}),
      ...(ariaInvalid !== undefined ? { "aria-invalid": String(ariaInvalid) } : {}),
      ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      ...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {}),
      ...(ariaRequired !== undefined ? { "aria-required": String(ariaRequired) } : {}),
      ...(required ? { "aria-required": "true" } : {}),
      "aria-disabled": String(disabled),
      role: "textbox",
    };

    return [
      history(),
      keymap.of(historyKeymap),
      tokenHighlightExtension,
      createEditorTheme(multiline),
      EditorView.contentAttributes.of(contentAttributes),
      ...(multiline ? [EditorView.lineWrapping] : []),
    ];
  }, [ariaDescribedBy, ariaInvalid, ariaLabel, ariaLabelledBy, ariaRequired, disabled, id, multiline, required]);

  function handleChange(nextValue: string) {
    const limitedValue = maxLength === undefined ? nextValue : nextValue.slice(0, maxLength);
    handleValueChange(limitedValue);
  }

  const editorHeight = props.height ?? (multiline ? "133px" : "52px");

  return (
    <>
      <CodeMirror
        {...props}
        basicSetup={false}
        className={cn(editorClassName, className)}
        editable={!disabled && !readOnly}
        extensions={editorExtensions}
        height={editorHeight}
        readOnly={disabled || readOnly}
        value={currentValue}
        onChange={handleChange}
      />
      {name ? (
        <input
          disabled={disabled}
          maxLength={maxLength}
          name={name}
          readOnly
          required={required}
          tabIndex={-1}
          type="hidden"
          value={currentValue}
        />
      ) : null}
    </>
  );
}

function SyntaxHighlightedInput(props: CodeMirrorFieldProps) {
  return <CodeMirrorField {...props} multiline={false} />;
}

function SyntaxHighlightedTextarea(props: CodeMirrorFieldProps) {
  return <CodeMirrorField {...props} multiline />;
}

export { SyntaxHighlightedInput, SyntaxHighlightedTextarea };
