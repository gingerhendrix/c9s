import type { Cell, Row, Tone } from "./format.ts";
import { first, formatAge, formatBytes, shortId, statusTone, text, toTime } from "./format.ts";
import type { ColumnSpec } from "./types.ts";

type Get = (row: Row) => unknown;

const getter = (source: string | Get): Get =>
  typeof source === "string" ? (row) => first(row, ...source.split("|")) : source;

/**
 * Small builders for curated columns. A path such as `"plan.name"` reads a
 * nested field; `"a|b"` reads the first present of several fields.
 */
export const col = {
  age: (source: string | Get, header = "AGE"): ColumnSpec => {
    const get = getter(source);
    return {
      align: "right",
      cell: (row): Cell => ({ text: formatAge(get(row)), tone: "muted" }),
      header,
      id: `age:${header}`,
      sort: (row) => -(toTime(get(row)) ?? 0),
    };
  },

  bool: (
    source: string | Get,
    header: string,
    labels: [string, string] = ["yes", "no"],
    onTone: Tone = "success",
  ): ColumnSpec => {
    const get = getter(source);
    return {
      cell: (row): Cell =>
        get(row) === true ? { text: labels[0], tone: onTone } : { text: labels[1], tone: "muted" },
      header,
      id: header,
    };
  },

  bytes: (source: string | Get, header = "SIZE"): ColumnSpec => {
    const get = getter(source);
    return {
      align: "right",
      cell: (row): Cell => ({ text: formatBytes(get(row)) }),
      header,
      id: header,
      sort: (row) => Number(get(row) ?? 0),
    };
  },

  id: (source: string | Get, header = "ID", length?: number): ColumnSpec => {
    const get = getter(source);
    return {
      cell: (row): Cell => ({
        text: length === undefined ? text(get(row)) : shortId(get(row), length),
        tone: "muted",
      }),
      header,
      id: header,
    };
  },

  number: (source: string | Get, header: string): ColumnSpec => {
    const get = getter(source);
    return {
      align: "right",
      cell: (row): Cell => ({ text: text(get(row)) }),
      header,
      id: header,
      sort: (row) => Number(get(row) ?? 0),
    };
  },

  status: (source: string | Get, header = "STATUS"): ColumnSpec => {
    const get = getter(source);
    return {
      cell: (row): Cell => {
        const value = get(row);
        return { text: text(value), tone: statusTone(value) };
      },
      header,
      id: header,
    };
  },

  text: (
    source: string | Get,
    header: string,
    options: { tone?: Tone | ((row: Row) => Tone); grow?: boolean } = {},
  ): ColumnSpec => {
    const get = getter(source);
    const { tone } = options;
    return {
      cell: (row): Cell => ({
        text: text(get(row)),
        tone: typeof tone === "function" ? tone(row) : tone,
      }),
      grow: options.grow,
      header,
      id: header,
    };
  },
};
