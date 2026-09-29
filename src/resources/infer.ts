import type { Cell, Row, Tone } from "./format.ts";
import { formatAge, headerFor, isRow, pick, statusTone, text, toTime } from "./format.ts";
import type { ColumnSpec } from "./types.ts";

/**
 * Pull table rows out of a `cf` result without knowing the product.
 *
 * - An array of objects is the rows.
 * - An array of scalars becomes `{ value }` rows.
 * - An object with an array of objects (R2's `{ buckets: [...] }`) uses that array.
 * - Any other object becomes key/value rows, so settings-style results still browse.
 */
export const extractRows = function extractRows(data: unknown): Row[] {
  if (Array.isArray(data)) {
    return data.map((item): Row => (isRow(item) ? item : { value: item }));
  }
  if (isRow(data)) {
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && (value.length === 0 || value.some(isRow))) {
        return extractRows(value);
      }
    }
    return Object.entries(data).map(([key, value]): Row => ({ key, value }));
  }
  if (data === undefined || data === null) {
    return [];
  }
  return [{ value: data }];
};

const NAME_KEYS = [
  "name",
  "title",
  "hostname",
  "key",
  "queue_name",
  "script_name",
  "email",
  "domain",
  "label",
  "pattern",
  "slug",
  "value",
];
const STATUS_KEYS = [
  "type",
  "status",
  "state",
  "enabled",
  "active",
  "paused",
  "proxied",
  "mode",
  "kind",
  "action",
  "health",
];
const ID_KEYS = ["id", "uuid", "tag"];
const CREATED_KEYS = ["created_on", "created_at", "createdOn", "createdAt", "creation_date", "created"];
const MODIFIED_KEYS = [
  "modified_on",
  "modified_at",
  "updated_on",
  "updated_at",
  "modifiedOn",
  "updatedAt",
  "last_modified",
  "modified",
];

const MAX_COLUMNS = 7;
const SAMPLE = 50;

interface KeyStats {
  /** Top-level key, or `parent.child` for one level of nesting. */
  readonly key: string;
  readonly depth: number;
  present: number;
  scalar: number;
  totalLength: number;
}

const isScalar = (value: unknown): boolean =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

/**
 * Keys that appear in the sample rows, in first-seen order. Nested objects
 * contribute their scalar fields as `parent.child` keys, so a Hyperdrive
 * `origin.host` can become a column.
 */
const collectStats = function collectStats(rows: readonly Row[]): KeyStats[] {
  const stats = new Map<string, KeyStats>();
  const record = (key: string, depth: number, value: unknown): void => {
    let entry = stats.get(key);
    if (entry === undefined) {
      entry = { depth, key, present: 0, scalar: 0, totalLength: 0 };
      stats.set(key, entry);
    }
    if (value !== undefined && value !== null && value !== "") {
      entry.present += 1;
    }
    if (isScalar(value) || (Array.isArray(value) && value.every(isScalar))) {
      entry.scalar += 1;
    }
    entry.totalLength += text(value).length;
  };
  for (const row of rows.slice(0, SAMPLE)) {
    for (const [key, value] of Object.entries(row)) {
      record(key, 0, value);
      if (isRow(value)) {
        for (const [child, childValue] of Object.entries(value)) {
          if (isScalar(childValue)) {
            record(`${key}.${child}`, 1, childValue);
          }
        }
      }
    }
  }
  return [...stats.values()];
};

const toneFor = function toneFor(key: string, value: unknown): Tone {
  if (typeof value === "boolean") {
    return value ? "success" : "muted";
  }
  if (STATUS_KEYS.includes(key)) {
    const tone = statusTone(value);
    return tone === "text" ? "accent" : tone;
  }
  return "text";
};

const valueColumn = function valueColumn(key: string): ColumnSpec {
  const leaf = key.split(".").at(-1) ?? key;
  return {
    cell: (row): Cell => {
      const value = pick(row, key);
      return { text: text(value), tone: toneFor(leaf, value) };
    },
    header: headerFor(key),
    id: key,
  };
};

const idColumn = function idColumn(key: string): ColumnSpec {
  return {
    cell: (row): Cell => ({ text: text(pick(row, key)), tone: "muted" }),
    header: headerFor(key),
    id: key,
  };
};

const ageColumn = function ageColumn(key: string, header: string): ColumnSpec {
  return {
    align: "right",
    cell: (row): Cell => ({ text: formatAge(row[key]), tone: "muted" }),
    header,
    id: `${key}:age`,
    sort: (row) => -(toTime(row[key]) ?? 0),
  };
};

/**
 * Choose up to seven columns for rows of an unknown product, k9s-style:
 * the name first, then status-like fields, other short scalars, the ID, and AGE last.
 */
export const inferColumns = function inferColumns(rows: readonly Row[]): ColumnSpec[] {
  if (rows.length === 0) {
    return [];
  }
  const stats = collectStats(rows).filter((entry) => entry.present > 0 && entry.scalar > 0);
  const keys = new Set(stats.map((entry) => entry.key));
  const taken = new Set<string>();
  const columns: ColumnSpec[] = [];
  const take = (key: string, column: ColumnSpec): void => {
    if (!taken.has(key) && columns.length < MAX_COLUMNS) {
      taken.add(key);
      columns.push(column);
    }
  };

  const idKey =
    ID_KEYS.find((key) => keys.has(key)) ??
    stats.find((entry) => entry.depth === 0 && entry.key.endsWith("_id"))?.key;
  const nameKey =
    NAME_KEYS.find((key) => keys.has(key)) ??
    stats.find((entry) => entry.depth === 0 && entry.key.endsWith("_name"))?.key;
  // With no name field, the ID is the name (AI Gateway IDs are slugs).
  const leadKey = nameKey ?? idKey;
  if (leadKey !== undefined) {
    take(leadKey, valueColumn(leadKey));
  }
  for (const key of STATUS_KEYS) {
    if (keys.has(key)) {
      take(key, valueColumn(key));
    }
  }

  const createdKey = CREATED_KEYS.find((key) => keys.has(key));
  const modifiedKey = MODIFIED_KEYS.find((key) => keys.has(key));
  const reserved = [idKey, createdKey, modifiedKey].filter((key) => key !== undefined);
  const trailing = (idKey === undefined || taken.has(idKey) ? 0 : 1) + ((createdKey ?? modifiedKey) ? 1 : 0);

  const others = stats
    .filter((entry) => !taken.has(entry.key) && !reserved.includes(entry.key))
    .filter((entry) => entry.totalLength / Math.max(1, entry.present) <= 60)
    .toSorted((a, b) => a.depth - b.depth || b.present - a.present);
  for (const entry of others) {
    if (columns.length >= MAX_COLUMNS - trailing) {
      break;
    }
    take(entry.key, valueColumn(entry.key));
  }

  if (idKey !== undefined) {
    take(idKey, idColumn(idKey));
  }
  if (modifiedKey !== undefined && createdKey !== undefined && columns.length < MAX_COLUMNS - 1) {
    take(`${modifiedKey}:age`, ageColumn(modifiedKey, "UPDATED"));
  }
  const ageKey = createdKey ?? modifiedKey;
  if (ageKey !== undefined) {
    take(`${ageKey}:age`, ageColumn(ageKey, "AGE"));
  }

  if (columns.length === 0) {
    return [
      {
        cell: (row): Cell => ({ text: JSON.stringify(row) }),
        grow: true,
        header: "VALUE",
        id: "json",
      },
    ];
  }
  return columns;
};

/** Best-effort stable key for a row of an unknown product. */
export const inferKey = function inferKey(row: Row, index: number): string {
  for (const key of [...ID_KEYS, ...NAME_KEYS]) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return String(index);
};

/** Best-effort short label for a row of an unknown product. */
export const inferLabel = function inferLabel(row: Row): string {
  for (const key of [...NAME_KEYS, ...ID_KEYS]) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return "item";
};
