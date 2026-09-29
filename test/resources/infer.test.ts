import { describe, expect, test } from "bun:test";

import { extractRows, inferColumns, inferKey, inferLabel } from "../../src/resources/infer.ts";

describe("extractRows", () => {
  test("handles arrays, wrapped arrays, scalars and settings objects", () => {
    expect(extractRows([{ id: 1 }, 2])).toEqual([{ id: 1 }, { value: 2 }]);
    expect(extractRows({ buckets: [{ name: "a" }], cursor: "x" })).toEqual([{ name: "a" }]);
    expect(extractRows({ buckets: [] })).toEqual([]);
    expect(extractRows({ enabled: true, mode: "on" })).toEqual([
      { key: "enabled", value: true },
      { key: "mode", value: "on" },
    ]);
    expect(extractRows(null)).toEqual([]);
  });
});

describe("inferColumns", () => {
  test("orders name, status, other scalars, ID, then AGE", () => {
    const rows = [
      {
        created_on: "2026-01-01T00:00:00Z",
        id: "abc",
        modified_on: "2026-02-01T00:00:00Z",
        name: "one",
        nested: { deep: [1] },
        region: "WEUR",
        status: "active",
      },
      {
        created_on: "2026-01-02T00:00:00Z",
        id: "def",
        modified_on: "2026-02-02T00:00:00Z",
        name: "two",
        nested: { deep: [2] },
        region: "ENAM",
        status: "down",
      },
    ];
    const headers = inferColumns(rows).map((column) => column.header);
    expect(headers).toEqual(["NAME", "STATUS", "REGION", "ID", "UPDATED", "AGE"]);
    const status = inferColumns(rows)[1];
    expect(status?.cell(rows[1]!)).toEqual({ text: "down", tone: "error" });
  });

  test("leads with the ID when there is no name", () => {
    const rows = [
      {
        cache_ttl: 300,
        created_at: "2026-01-01T00:00:00Z",
        id: "support-bot",
        modified_at: "2026-02-01T00:00:00Z",
      },
    ];
    expect(inferColumns(rows).map((column) => column.header)).toEqual(["ID", "CACHE TTL", "UPDATED", "AGE"]);
  });

  test("flattens one level of nested objects", () => {
    const rows = [{ id: "h1", name: "orders", origin: { host: "db.internal", port: 5432 } }];
    expect(inferColumns(rows).map((column) => column.header)).toEqual([
      "NAME",
      "ORIGIN HOST",
      "ORIGIN PORT",
      "ID",
    ]);
    expect(inferColumns(rows)[1]?.cell(rows[0]!).text).toBe("db.internal");
  });

  test("has no columns for no rows", () => {
    expect(inferColumns([])).toEqual([]);
  });

  test("falls back to a JSON column", () => {
    const rows = [{ nested: { list: [{ a: 1 }] } }];
    expect(inferColumns(rows).map((column) => column.header)).toEqual(["VALUE"]);
  });
});

describe("keys and labels", () => {
  test("prefer IDs for keys and names for labels", () => {
    expect(inferKey({ id: "x", name: "n" }, 3)).toBe("x");
    expect(inferKey({ other: true }, 3)).toBe("3");
    expect(inferLabel({ id: "x", name: "n" })).toBe("n");
    expect(inferLabel({})).toBe("item");
  });
});
