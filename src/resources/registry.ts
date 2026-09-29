import type { Catalogue, CatalogueCommand } from "../cf/catalogue.ts";
import { browsableCommands, commandScope, groupTitle, siblingCommand } from "../cf/catalogue.ts";
import { CURATED_KINDS } from "./curated.ts";
import { first, text } from "./format.ts";
import { extractRows, inferKey, inferLabel } from "./infer.ts";
import type { ResourceKind } from "./types.ts";

const GENERIC_PREFIX = "cf:";

/** Two-thirds of catalogue group descriptions just say "Operations for x"; the command summary reads better. */
const describeGroup = (description: string | undefined, summary: string): string =>
  description === undefined || /^operations for\b|\boperations$/iu.test(description) ? summary : description;

/** Resource kind for any browsable `list` command in the catalogue. */
export const genericKind = function genericKind(
  catalogue: Catalogue,
  command: CatalogueCommand,
): ResourceKind {
  const group = command.path.slice(0, -1);
  const scope = commandScope(command);
  const get = siblingCommand(catalogue, command, "get");
  // `get` is describable when its only required input is one positional ID.
  const describable =
    get !== undefined &&
    !get.hidden &&
    get.positionals.length === 1 &&
    get.required.length === 1 &&
    get.required[0] === get.positionals[0];

  return {
    aliases: [group.join(" "), group.join("-")],
    columns: "auto",
    command: command.command,
    describe: describable
      ? (row) => {
          const id = text(first(row, "id", "uuid", "name", "tag"));
          return id === "" ? undefined : { argv: [...get.path, id] };
        }
      : undefined,
    description: describeGroup(catalogue.descriptions.get(group.join(" ")), command.summary),
    enter: "describe",
    generic: true,
    icon: "·",
    id: `${GENERIC_PREFIX}${group.join(" ")}`,
    key: inferKey,
    label: inferLabel,
    list: (_params, session) => ({
      argv: [...command.path],
      context: scope === "zone" ? { zone: session.zoneId } : undefined,
    }),
    rows: extractRows,
    scope,
    title: groupTitle(group),
  };
};

export interface Registry {
  readonly kinds: readonly ResourceKind[];
  /** Kinds you can open directly (no parent row needed), in picker order. */
  readonly openable: readonly ResourceKind[];
  get: (id: string) => ResourceKind | undefined;
  /** Resolve a user-typed name such as `dns`, `zones` or `ai-gateway gateways`. */
  resolve: (name: string) => ResourceKind | undefined;
}

export const createRegistry = function createRegistry(catalogue: Catalogue | null): Registry {
  const curatedCommands = new Set(CURATED_KINDS.map((kind) => kind.command));
  const generic =
    catalogue === null
      ? []
      : browsableCommands(catalogue)
          .filter((command) => !curatedCommands.has(command.command))
          .map((command) => genericKind(catalogue, command));
  const kinds = [...CURATED_KINDS, ...generic];
  const byId = new Map(kinds.map((kind) => [kind.id, kind]));

  const openable = kinds.filter((kind) => kind.requires === undefined);
  const byAlias = new Map<string, ResourceKind>();
  for (const kind of openable) {
    const names = [kind.id, kind.title, ...kind.aliases];
    for (const name of names) {
      const key = name.toLowerCase();
      // Curated kinds come first and keep their aliases.
      if (!byAlias.has(key)) {
        byAlias.set(key, kind);
      }
    }
  }

  return {
    get: (id) => byId.get(id),
    kinds,
    openable,
    resolve: (name) => {
      const key = name.trim().toLowerCase().replace(/^:/u, "");
      return byAlias.get(key);
    },
  };
};
