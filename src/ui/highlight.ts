import type { Tone } from "../resources/format.ts";

export interface Span {
  readonly text: string;
  readonly tone: Tone;
}

export type DocumentFormat = "json" | "yaml" | "text";

/** Bun's YAML puts `{}` and `[]` on their own line; keep them beside their key. */
const joinEmptyCollections = (lines: readonly string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    const previous = out.at(-1);
    if (previous !== undefined && previous.endsWith(":") && /^\s*(?:\{\}|\[\])$/u.test(line)) {
      out[out.length - 1] = `${previous} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out;
};

/** Render a value as the lines of a describe document. */
export const renderDocument = function renderDocument(value: unknown, format: DocumentFormat): string[] {
  if (format === "text") {
    return (typeof value === "string" ? value : JSON.stringify(value, null, 2)).split(/\r?\n/u);
  }
  if (format === "yaml") {
    return joinEmptyCollections(
      Bun.YAML.stringify(value, null, 2)
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line, index, lines) => !(line === "" && index === lines.length - 1)),
    );
  }
  return (JSON.stringify(value, null, 2) ?? "null").split("\n");
};

const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const KEYWORD = /^(?:true|false|null|~)$/u;

const scalarTone = (value: string): Tone => {
  if (value.startsWith('"') || value.startsWith("'")) {
    return "success";
  }
  if (NUMBER.test(value)) {
    return "warning";
  }
  if (KEYWORD.test(value)) {
    return "accent";
  }
  if (/^[[\]{}]+$/u.test(value)) {
    return "muted";
  }
  return "success";
};

/** Split a value into its body and a trailing JSON comma. */
const valueSpans = (value: string): Span[] => {
  if (value === "") {
    return [];
  }
  const comma = value.endsWith(",") ? "," : "";
  const body = comma === "" ? value : value.slice(0, -1);
  const spans: Span[] = [{ text: body, tone: scalarTone(body) }];
  if (comma !== "") {
    spans.push({ text: comma, tone: "muted" });
  }
  return spans;
};

const JSON_KEY = /^(\s*)("(?:[^"\\]|\\.)*")(:\s?)(.*)$/u;
const YAML_KEY = /^(\s*)(- )?((?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s:#][^:#]*?)):(?:\s(.*))?$/u;
const YAML_ITEM = /^(\s*)(- )(.*)$/u;

/** Colour one line of pretty-printed JSON or YAML. */
export const highlightLine = function highlightLine(line: string, format: DocumentFormat): Span[] {
  if (format === "text") {
    return [{ text: line, tone: "text" }];
  }
  if (format === "json") {
    const match = JSON_KEY.exec(line);
    if (match) {
      const [, indent = "", key = "", colon = "", rest = ""] = match;
      return [
        { text: indent, tone: "text" },
        { text: key, tone: "primary" },
        { text: colon, tone: "muted" },
        ...valueSpans(rest),
      ];
    }
    const indent = /^\s*/u.exec(line)?.[0] ?? "";
    return [{ text: indent, tone: "text" }, ...valueSpans(line.slice(indent.length))];
  }

  const keyMatch = YAML_KEY.exec(line);
  if (keyMatch) {
    const [, indent = "", dash = "", key = "", rest = ""] = keyMatch;
    return [
      { text: indent, tone: "text" },
      { text: dash, tone: "muted" },
      { text: key, tone: "primary" },
      { text: rest === "" ? ":" : ": ", tone: "muted" },
      ...(rest === "" ? [] : [{ text: rest, tone: scalarTone(rest) }]),
    ];
  }
  const item = YAML_ITEM.exec(line);
  if (item) {
    const [, indent = "", dash = "", rest = ""] = item;
    return [
      { text: indent, tone: "text" },
      { text: dash, tone: "muted" },
      { text: rest, tone: scalarTone(rest) },
    ];
  }
  return [{ text: line, tone: "text" }];
};
