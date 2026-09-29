import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * The command catalogue that ships inside the `cf` npm package
 * (`dist/_meta/commands.json`). It is generated from Cloudflare's OpenAPI
 * spec, so every API product appears here with the same shape. c9s reads it
 * to offer a resource view for every `list` command without code per product.
 */
export interface CatalogueCommand {
  /** `cf zones list` */
  readonly command: string;
  /** `["zones", "list"]` */
  readonly path: readonly string[];
  readonly summary: string;
  readonly description: string;
  readonly category: string;
  readonly httpMethod: string;
  readonly apiPath: string;
  readonly hidden: boolean;
  /** Positional argument names, in order. */
  readonly positionals: readonly string[];
  /** Names of required positionals and options. */
  readonly required: readonly string[];
  /** Names of all options. */
  readonly options: readonly string[];
}

export interface Catalogue {
  /** Where the catalogue was read from. */
  readonly source: string;
  readonly commands: readonly CatalogueCommand[];
  /** Group descriptions keyed by command path, e.g. `"kv namespaces"`. */
  readonly descriptions: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// JSON boundary
// ---------------------------------------------------------------------------

type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };
type JsonObject = { readonly [key: string]: Json };

const isObject = (value: Json | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);

const str = (value: Json | undefined): string => (typeof value === "string" ? value : "");

const names = (value: Json | undefined, requiredOnly: boolean): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const entry of value as readonly Json[]) {
    if (isObject(entry) && typeof entry.name === "string") {
      if (!requiredOnly || entry.required === true) {
        result.push(entry.name);
      }
    }
  }
  return result;
};

const decodeCommand = (value: Json): CatalogueCommand | null => {
  if (!isObject(value) || typeof value.command !== "string") {
    return null;
  }
  const fullPath = Array.isArray(value.fullPath)
    ? (value.fullPath as readonly Json[]).filter((part): part is string => typeof part === "string")
    : value.command.replace(/^cf\s+/u, "").split(" ");
  return {
    apiPath: str(value.apiPath),
    category: str(value.category),
    command: value.command,
    description: str(value.description),
    hidden: value.hideCommand === true,
    httpMethod: str(value.httpMethod),
    options: names(value.options, false),
    path: fullPath,
    positionals: names(value.arguments, false),
    required: [...names(value.arguments, true), ...names(value.options, true)],
    summary: str(value.summary),
  };
};

/** Decode the text of a `commands.json` file. Throws on a malformed file. */
export const decodeCatalogue = function decodeCatalogue(text: string, source: string): Catalogue {
  const parsed = JSON.parse(text) as Json;
  if (!isObject(parsed) || !Array.isArray(parsed.commands)) {
    throw new TypeError(`${source} is not a cf command catalogue`);
  }
  const commands: CatalogueCommand[] = [];
  for (const entry of parsed.commands as readonly Json[]) {
    const command = decodeCommand(entry);
    if (command !== null) {
      commands.push(command);
    }
  }
  const descriptions = new Map<string, string>();
  if (isObject(parsed.descriptions)) {
    for (const [key, value] of Object.entries(parsed.descriptions)) {
      if (typeof value === "string") {
        descriptions.set(key, value);
      }
    }
  }
  return { commands, descriptions, source };
};

// ---------------------------------------------------------------------------
// Locating the installed catalogue
// ---------------------------------------------------------------------------

/** Find `commands.json` next to the installed `cf` binary. */
export const locateCatalogue = function locateCatalogue(bin = "cf"): string | null {
  const override = process.env.C9S_CATALOGUE;
  if (override !== undefined && override !== "") {
    return existsSync(override) ? override : null;
  }
  const resolved = bin.includes("/") ? bin : Bun.which(bin);
  if (resolved === null) {
    return null;
  }
  try {
    const real = realpathSync(resolved);
    const packageRoot = path.resolve(path.dirname(real), "..");
    const candidate = path.join(packageRoot, "dist", "_meta", "commands.json");
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
};

export const loadCatalogue = function loadCatalogue(bin = "cf"): Catalogue | null {
  const file = locateCatalogue(bin);
  if (file === null) {
    return null;
  }
  try {
    return decodeCatalogue(readFileSync(file, "utf8"), file);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Scope a command runs in, derived from its API path. */
export type CommandScope = "global" | "account" | "zone";

const PATH_PARAM = /\{([a-z_]+)\}/gu;
const CONTEXT_PARAMS = new Set(["account_id", "zone_id", "account_or_zone", "account_or_zone_id"]);

export const commandScope = function commandScope(command: CatalogueCommand): CommandScope {
  if (command.apiPath.startsWith("/zones/{zone_id}")) {
    return "zone";
  }
  if (command.apiPath.includes("{account_id}") || command.apiPath.includes("{account_or_zone")) {
    return "account";
  }
  return "global";
};

/**
 * A `list` command c9s can open as a resource view with no extra input:
 * a visible read-only GET whose only path parameters are the account or zone.
 */
export const isBrowsable = function isBrowsable(command: CatalogueCommand): boolean {
  if (command.hidden || command.httpMethod !== "GET" || command.category !== "read") {
    return false;
  }
  if (command.path.at(-1) !== "list" || command.required.length > 0) {
    return false;
  }
  for (const match of command.apiPath.matchAll(PATH_PARAM)) {
    if (!CONTEXT_PARAMS.has(match[1] ?? "")) {
      return false;
    }
  }
  return true;
};

export const browsableCommands = function browsableCommands(catalogue: Catalogue): CatalogueCommand[] {
  return catalogue.commands.filter(isBrowsable).toSorted((a, b) => a.command.localeCompare(b.command));
};

/** A readable title for a command group, e.g. `["kv", "namespaces"]` -> `KV Namespaces`. */
export const groupTitle = function groupTitle(parts: readonly string[]): string {
  const ACRONYMS = new Set(["ai", "api", "d1", "dns", "do", "ip", "kv", "r2", "ssl", "tls", "waf"]);
  return parts
    .map((part) =>
      part
        .split("-")
        .map((word) =>
          ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1),
        )
        .join(" "),
    )
    .join(" ");
};

/** Find the `get` command next to a `list` command, if the catalogue has one. */
export const siblingCommand = function siblingCommand(
  catalogue: Catalogue,
  command: CatalogueCommand,
  name: string,
): CatalogueCommand | undefined {
  const parent = command.path.slice(0, -1).join(" ");
  return catalogue.commands.find(
    (candidate) => candidate.path.slice(0, -1).join(" ") === parent && candidate.path.at(-1) === name,
  );
};
