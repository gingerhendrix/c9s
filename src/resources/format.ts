/**
 * Cell formatting shared by curated and generic resource views.
 * Everything here is pure so the table and the tests agree.
 */

/** A JSON object as returned by the Cloudflare API. */
export type Row = { readonly [key: string]: unknown };

/** Semantic colour of a cell; the table maps tones to theme colours. */
export type Tone =
  | "text"
  | "muted"
  | "primary"
  | "accent"
  | "info"
  | "success"
  | "warning"
  | "error"
  | "brand";

export interface Cell {
  readonly text: string;
  readonly tone?: Tone;
}

export const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Read a dotted path such as `plan.name`, or a literal key that contains dots. */
export const pick = function pick(row: Row, path: string): unknown {
  if (path in row) {
    return row[path];
  }
  let current: unknown = row;
  for (const part of path.split(".")) {
    if (!isRow(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
};

/** First non-empty value among several paths. */
export const first = function first(row: Row, ...paths: string[]): unknown {
  for (const path of paths) {
    const value = pick(row, path);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
};

export const text = function text(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    return value.every((item) => typeof item !== "object" || item === null)
      ? value.map(text).join(", ")
      : `${value.length} items`;
  }
  if (isRow(value)) {
    const named = first(value, "name", "title", "id");
    return named === undefined ? JSON.stringify(value) : text(named);
  }
  return String(value);
};

/** Parse a timestamp in ISO-8601, epoch seconds or epoch milliseconds. */
export const toTime = function toTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value !== "") {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
  return null;
};

/** k9s-style age: `42s`, `5m`, `3h`, `12d`, `2y`. */
export const formatAge = function formatAge(value: unknown, now = Date.now()): string {
  const time = toTime(value);
  if (time === null) {
    return "";
  }
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 730) {
    return `${days}d`;
  }
  return `${Math.floor(days / 365)}y`;
};

/** Relative time in the future, for expirations: `in 3d`. */
export const formatUntil = function formatUntil(value: unknown, now = Date.now()): string {
  const time = toTime(value);
  if (time === null) {
    return "";
  }
  if (time <= now) {
    return "expired";
  }
  return `in ${formatAge(now - (time - now), now)}`;
};

export const formatBytes = function formatBytes(value: unknown): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${size} B` : `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
};

export const shortId = function shortId(value: unknown, length = 8): string {
  const id = text(value);
  return id.length > length ? id.slice(0, length) : id;
};

/** Cuts `value` to at most `width` characters, ending with "…" when it is cut. */
export const truncate = function truncate(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }
  return width <= 0 ? "" : `${value.slice(0, width - 1)}…`;
};

const SUCCESS = new Set([
  "active",
  "healthy",
  "enabled",
  "ready",
  "success",
  "succeeded",
  "deployed",
  "live",
  "on",
  "true",
  "valid",
  "connected",
  "running",
]);
const WARNING = new Set([
  "pending",
  "initializing",
  "degraded",
  "paused",
  "queued",
  "building",
  "moved",
  "provisioning",
  "deploying",
  "idle",
  "canceled",
  "cancelled",
]);
const ERROR = new Set([
  "error",
  "failed",
  "failure",
  "down",
  "deleted",
  "disabled",
  "inactive",
  "expired",
  "blocked",
  "off",
  "false",
  "unhealthy",
]);

/** Colour a status-like value. */
export const statusTone = function statusTone(value: unknown): Tone {
  const key = text(value).toLowerCase();
  if (SUCCESS.has(key)) {
    return "success";
  }
  if (WARNING.has(key)) {
    return "warning";
  }
  if (ERROR.has(key)) {
    return "error";
  }
  return "text";
};

/** Upper-case a JSON key for a k9s-style header: `created_on` -> `CREATED ON`. */
export const headerFor = function headerFor(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .replace(/[_.-]+/gu, " ")
    .trim()
    .toUpperCase();
};

/** Stable text used to filter a row: every visible cell, joined. */
export const rowSearchText = function rowSearchText(cells: readonly Cell[]): string {
  return cells.map((cell) => cell.text).join("  ");
};
