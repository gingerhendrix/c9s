import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
  browsableCommands,
  commandScope,
  decodeCatalogue,
  groupTitle,
  loadCatalogue,
  siblingCommand,
} from "../../src/cf/catalogue.ts";

const FIXTURE = path.join(import.meta.dir, "..", "fixtures", "commands.json");
const catalogue = decodeCatalogue(readFileSync(FIXTURE, "utf8"), FIXTURE);

const byCommand = (command: string) => {
  const found = catalogue.commands.find((entry) => entry.command === command);
  if (found === undefined) {
    throw new Error(`missing ${command}`);
  }
  return found;
};

describe("decodeCatalogue", () => {
  test("decodes commands and skips malformed entries", () => {
    expect(catalogue.commands).toHaveLength(8);
    expect(byCommand("cf widgets get")).toMatchObject({
      path: ["widgets", "get"],
      positionals: ["widget-id"],
      required: ["widget-id"],
    });
    expect(catalogue.descriptions.get("widgets parts")).toBe("Parts of widgets");
  });

  test("rejects files that are not catalogues", () => {
    expect(() => decodeCatalogue("[]", "x.json")).toThrow("not a cf command catalogue");
  });
});

describe("queries", () => {
  test("browsable commands are visible read-only lists with no extra input", () => {
    expect(browsableCommands(catalogue).map((command) => command.command)).toEqual([
      "cf rules list",
      "cf shared list",
      "cf widgets list",
      "cf zones list",
    ]);
  });

  test("scope comes from the API path", () => {
    expect(commandScope(byCommand("cf zones list"))).toBe("global");
    expect(commandScope(byCommand("cf widgets list"))).toBe("account");
    expect(commandScope(byCommand("cf rules list"))).toBe("zone");
    expect(commandScope(byCommand("cf shared list"))).toBe("account");
  });

  test("finds sibling get commands", () => {
    expect(siblingCommand(catalogue, byCommand("cf widgets list"), "get")?.command).toBe("cf widgets get");
    expect(siblingCommand(catalogue, byCommand("cf rules list"), "get")).toBeUndefined();
  });

  test("group titles keep product acronyms", () => {
    expect(groupTitle(["kv", "namespaces"])).toBe("KV Namespaces");
    expect(groupTitle(["ai-gateway", "gateways"])).toBe("AI Gateway Gateways");
  });
});

describe("installed cf catalogue", () => {
  const installed = loadCatalogue("cf");
  test.skipIf(installed === null)("offers well over a hundred browsable resources", () => {
    expect(browsableCommands(installed!).length).toBeGreaterThan(100);
  });
});
