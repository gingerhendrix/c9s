import { describe, expect, test } from "bun:test";

import type { Cell } from "../../src/resources/format.ts";
import type { ColumnSpec } from "../../src/resources/types.ts";
import {
  filterIndices,
  fit,
  layoutColumns,
  nextSortColumn,
  sortIndices,
  truncate,
} from "../../src/resources/view-model.ts";

const column = (header: string, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({
  cell: (row) => ({ text: String(row[header] ?? "") }),
  header,
  id: header,
  ...extra,
});

describe("filterIndices", () => {
  const texts = ["www.acme.dev CNAME proxied", "acme.dev A 192.0.2.1", "mail.acme.dev MX dns only"];
  test("all terms must match, case-insensitively", () => {
    expect(filterIndices(texts, "ACME cname")).toEqual([0]);
    expect(filterIndices(texts, "acme")).toEqual([0, 1, 2]);
  });
  test("a ! term excludes", () => {
    expect(filterIndices(texts, "acme !mx")).toEqual([0, 1]);
    expect(filterIndices(texts, "!")).toEqual([0, 1, 2]);
  });
});

describe("sortIndices", () => {
  const rows = [
    { n: "b", size: 10 },
    { n: "a", size: 2 },
    { n: "c", size: 2 },
  ];
  const cells: Cell[][] = rows.map((row) => [{ text: row.n }, { text: String(row.size) }]);
  const columns = [column("n"), column("size", { sort: (row) => Number(row.size) })];

  test("keeps API order without a sort", () => {
    expect(sortIndices([0, 1, 2], rows, cells, columns, null)).toEqual([0, 1, 2]);
  });
  test("sorts text and numbers, stable on ties", () => {
    expect(sortIndices([0, 1, 2], rows, cells, columns, { column: 0, desc: false })).toEqual([1, 0, 2]);
    expect(sortIndices([0, 1, 2], rows, cells, columns, { column: 1, desc: false })).toEqual([1, 2, 0]);
    expect(sortIndices([0, 1, 2], rows, cells, columns, { column: 1, desc: true })).toEqual([0, 1, 2]);
  });
  test("nextSortColumn cycles back to API order", () => {
    expect(nextSortColumn(null, 2)).toEqual({ column: 0, desc: false });
    expect(nextSortColumn({ column: 0, desc: true }, 2)).toEqual({ column: 1, desc: true });
    expect(nextSortColumn({ column: 1, desc: false }, 2)).toBeNull();
    expect(nextSortColumn(null, 0)).toBeNull();
  });
});

describe("truncate and fit", () => {
  test("cut to display width with an ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
    expect(truncate("☁ proxied", 4)).toBe("☁ p…");
    expect(fit("ab", 4)).toBe("ab  ");
    expect(fit("12", 4, "right")).toBe("  12");
    expect(fit("a\nb", 4)).toBe("a b ");
  });
});

describe("layoutColumns", () => {
  const columns = [
    column("NAME"),
    column("STATUS"),
    column("CONTENT", { grow: true }),
    column("ID"),
    column("AGE"),
  ];
  const cells: Cell[][] = [
    [
      { text: "a-very-long-zone-name.example.com" },
      { text: "active" },
      { text: "x".repeat(60) },
      { text: "f".repeat(32) },
      { text: "2y" },
    ],
  ];

  test("uses natural widths and gives spare space to grow columns", () => {
    const widths = layoutColumns(columns, cells, 200, 2);
    expect(widths[0]).toBe(33);
    expect(widths.reduce((sum, width) => sum + width, 0) + 8).toBe(200);
  });

  test("shrinks the widest columns first but protects the name", () => {
    const widths = layoutColumns(columns, cells, 90, 2);
    expect(widths[0]).toBeGreaterThanOrEqual(28);
    expect(widths.reduce((sum, width) => sum + width, 0) + 8).toBeLessThanOrEqual(90);
  });

  test("hides columns from the right when nothing else fits, keeping the first and last", () => {
    const widths = layoutColumns(columns, cells, 50, 2);
    expect(widths[0]).toBeGreaterThan(0);
    expect(widths[4]).toBeGreaterThan(0);
    expect(widths.filter((width) => width === 0).length).toBeGreaterThan(0);
    const shown = widths.filter((width) => width > 0);
    expect(shown.reduce((sum, width) => sum + width, 0) + 2 * (shown.length - 1)).toBeLessThanOrEqual(50);
  });
});
