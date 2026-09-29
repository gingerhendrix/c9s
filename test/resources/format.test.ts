import { describe, expect, test } from "bun:test";

import {
  first,
  formatAge,
  formatBytes,
  formatUntil,
  headerFor,
  pick,
  statusTone,
  text,
  toTime,
} from "../../src/resources/format.ts";

const NOW = Date.parse("2026-09-29T12:00:00Z");

describe("format", () => {
  test("formatAge uses k9s units", () => {
    expect(formatAge("2026-09-29T11:59:30Z", NOW)).toBe("30s");
    expect(formatAge("2026-09-29T11:15:00Z", NOW)).toBe("45m");
    expect(formatAge("2026-09-28T12:00:00Z", NOW)).toBe("24h");
    expect(formatAge("2026-09-19T12:00:00Z", NOW)).toBe("10d");
    expect(formatAge("2023-09-29T12:00:00Z", NOW)).toBe("3y");
    expect(formatAge(undefined, NOW)).toBe("");
  });

  test("timestamps accept ISO strings and epoch seconds", () => {
    expect(toTime(1_790_000_000)).toBe(1_790_000_000_000);
    expect(toTime("nope")).toBeNull();
    expect(formatUntil(NOW / 1000 + 3 * 86_400, NOW)).toBe("in 3d");
    expect(formatUntil(NOW / 1000 - 1, NOW)).toBe("expired");
  });

  test("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(412_332_032)).toBe("393 MB");
    expect(formatBytes("x")).toBe("");
  });

  test("pick and first read nested and literal keys", () => {
    const row = { annotations: { "workers/message": "hi" }, plan: { name: "Pro" }, "x.y": 1 };
    expect(pick(row, "plan.name")).toBe("Pro");
    expect(pick(row, "x.y")).toBe(1);
    expect(pick(row, "annotations.workers/message")).toBe("hi");
    expect(first(row, "missing", "plan.name")).toBe("Pro");
  });

  test("text flattens values for cells", () => {
    expect(text(["a", "b"])).toBe("a, b");
    expect(text([{ id: 1 }, { id: 2 }])).toBe("2 items");
    expect(text({ name: "n", id: "i" })).toBe("n");
    expect(text(null)).toBe("");
  });

  test("statusTone and headers", () => {
    expect(statusTone("active")).toBe("success");
    expect(statusTone("Pending")).toBe("warning");
    expect(statusTone("down")).toBe("error");
    expect(statusTone("full")).toBe("text");
    expect(headerFor("created_on")).toBe("CREATED ON");
    expect(headerFor("hasStoredData")).toBe("HAS STORED DATA");
  });
});
