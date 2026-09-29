import type { Cell, Row } from "./format.ts";
import type { ColumnSpec } from "./types.ts";

/** Current sort: a column index and a direction. */
export interface SortState {
  readonly column: number;
  readonly desc: boolean;
}

/**
 * k9s-style filter: space-separated terms must all match (case-insensitive);
 * a term starting with `!` must not match. Returns the matching row indices.
 */
export const filterIndices = function filterIndices(texts: readonly string[], query: string): number[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term !== "" && term !== "!");
  const indices: number[] = [];
  texts.forEach((text, index) => {
    const haystack = text.toLowerCase();
    const matches = terms.every((term) =>
      term.startsWith("!") ? !haystack.includes(term.slice(1)) : haystack.includes(term),
    );
    if (matches) {
      indices.push(index);
    }
  });
  return indices;
};

/** Stable sort of row indices by one column. */
export const sortIndices = function sortIndices(
  indices: readonly number[],
  rows: readonly Row[],
  cells: readonly (readonly Cell[])[],
  columns: readonly ColumnSpec[],
  sort: SortState | null,
): number[] {
  if (sort === null) {
    return [...indices];
  }
  const column = columns[sort.column];
  if (column === undefined) {
    return [...indices];
  }
  const keyOf = (index: number): string | number => {
    const row = rows[index];
    if (row !== undefined && column.sort !== undefined) {
      return column.sort(row);
    }
    return cells[index]?.[sort.column]?.text ?? "";
  };
  const direction = sort.desc ? -1 : 1;
  return indices
    .map((index) => ({ index, key: keyOf(index) }))
    .toSorted((a, b) => {
      const order =
        typeof a.key === "number" && typeof b.key === "number"
          ? a.key - b.key
          : String(a.key).localeCompare(String(b.key), undefined, { numeric: true, sensitivity: "base" });
      return order === 0 ? a.index - b.index : order * direction;
    })
    .map((entry) => entry.index);
};

/** `s` cycles: API order, then each column ascending, then back to API order. */
export const nextSortColumn = function nextSortColumn(
  sort: SortState | null,
  columnCount: number,
): SortState | null {
  if (columnCount === 0) {
    return null;
  }
  if (sort === null) {
    return { column: 0, desc: false };
  }
  return sort.column + 1 >= columnCount ? null : { column: sort.column + 1, desc: sort.desc };
};

// ---------------------------------------------------------------------------
// Column layout
// ---------------------------------------------------------------------------

export const displayWidth = (text: string): number => Bun.stringWidth(text);

/** Cut text to a display width, marking the cut with an ellipsis. */
export const truncate = function truncate(text: string, width: number): string {
  if (width <= 0) {
    return "";
  }
  if (displayWidth(text) <= width) {
    return text;
  }
  let out = "";
  let used = 0;
  for (const char of text) {
    const charWidth = displayWidth(char);
    if (used + charWidth > width - 1) {
      break;
    }
    out += char;
    used += charWidth;
  }
  return `${out}…`;
};

/** Pad or cut text to exactly `width` display columns. */
export const fit = function fit(text: string, width: number, align: "left" | "right" = "left"): string {
  const cut = truncate(text.replaceAll(/\s+/gu, " "), width);
  const padding = " ".repeat(Math.max(0, width - displayWidth(cut)));
  return align === "right" ? padding + cut : cut + padding;
};

const MIN_WIDTH = 4;
const FIRST_MIN = 28;
const CAP = 42;
const GROW_CAP = 90;
const SAMPLE = 300;

/**
 * Column widths for the available space. A width of 0 hides the column.
 *
 * Columns start at their natural width (header or widest sampled cell,
 * capped). When the table is too wide, the widest columns shrink first, but
 * the first column (the name) keeps up to 28 cells. If that is not enough,
 * columns are hidden from the right, keeping the first and the last (AGE).
 * Spare space goes to `grow` columns.
 */
export const layoutColumns = function layoutColumns(
  columns: readonly ColumnSpec[],
  cells: readonly (readonly Cell[])[],
  available: number,
  gap: number,
): number[] {
  const step = Math.max(1, Math.ceil(cells.length / SAMPLE));
  const sample = step === 1 ? cells : cells.filter((_, index) => index % step === 0);
  const natural = columns.map((column, index) => {
    let widest = displayWidth(column.header) + 1;
    for (const row of sample) {
      widest = Math.max(widest, displayWidth(row[index]?.text ?? ""));
    }
    return Math.max(MIN_WIDTH, Math.min(column.grow === true ? GROW_CAP : CAP, widest));
  });
  const minimum = columns.map((column, index) => {
    const own = natural[index] ?? MIN_WIDTH;
    return index === 0
      ? Math.min(own, FIRST_MIN)
      : Math.min(own, Math.max(MIN_WIDTH, displayWidth(column.header)));
  });

  const widths = [...natural];
  const visible = (): number[] =>
    widths.map((width, index) => (width > 0 ? index : -1)).filter((index) => index >= 0);
  const total = (): number => {
    const shown = visible();
    return shown.reduce((sum, index) => sum + (widths[index] ?? 0), 0) + gap * Math.max(0, shown.length - 1);
  };

  let overflow = total() - available;
  while (overflow > 0) {
    let widest = -1;
    for (const index of visible()) {
      const width = widths[index] ?? 0;
      if (width > (minimum[index] ?? MIN_WIDTH) && (widest === -1 || width > (widths[widest] ?? 0))) {
        widest = index;
      }
    }
    if (widest === -1) {
      // Everything is at its minimum: hide a column, rightmost first, keeping the first and last.
      const hideable = visible().filter((index) => index !== 0 && index !== columns.length - 1);
      const victim = hideable.at(-1);
      if (victim === undefined) {
        break;
      }
      widths[victim] = 0;
    } else {
      widths[widest] = (widths[widest] ?? MIN_WIDTH) - 1;
    }
    overflow = total() - available;
  }

  const growers = visible().filter((index) => columns[index]?.grow === true);
  const spare = available - total();
  if (spare > 0 && growers.length > 0) {
    growers.forEach((index, position) => {
      widths[index] =
        (widths[index] ?? 0) +
        Math.floor(spare / growers.length) +
        (position < spare % growers.length ? 1 : 0);
    });
  }
  return widths;
};
