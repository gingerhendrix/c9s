import type { Codec, RouterInstance } from "@tooee/router";

import type { Row } from "../resources/format.ts";
import { isRow } from "../resources/format.ts";
import type { ResourceParams } from "../resources/types.ts";
import type { SortState } from "../resources/view-model.ts";

// ---------------------------------------------------------------------------
// Route params: decoded at the router's serialized boundary
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeStringMap = (value: unknown): ResourceParams => {
  const out: Record<string, string> = {};
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "string") {
        out[key] = entry;
      }
    }
  }
  return out;
};

const requireString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new TypeError(`Route param "${key}" must be a non-empty string`);
  }
  return value;
};

/**
 * A resource list: which kind, and the parent params it needs. Route params
 * are type aliases so they satisfy the router's open `RouteParams` shape.
 */
export type ResourceTarget = {
  readonly kind: string;
  readonly params: ResourceParams;
};

export const resourceParamsCodec: Codec<ResourceTarget> = {
  parse(value: unknown): ResourceTarget {
    if (!isRecord(value)) {
      throw new TypeError("Resource route params must be an object");
    }
    return { kind: requireString(value, "kind"), params: decodeStringMap(value.params) };
  },
};

/** One row opened in the describe view. */
export type DescribeTarget = ResourceTarget & {
  readonly row: Row;
  readonly label: string;
};

export const describeParamsCodec: Codec<DescribeTarget> = {
  parse(value: unknown): DescribeTarget {
    if (!isRecord(value) || !isRow(value.row)) {
      throw new TypeError("Describe route params need a kind and a row");
    }
    return {
      kind: requireString(value, "kind"),
      label: typeof value.label === "string" ? value.label : "",
      params: decodeStringMap(value.params),
      row: value.row,
    };
  },
};

/** Where boot should land once the account is known. */
export type BootTarget = {
  readonly target?: ResourceTarget;
};

export const bootParamsCodec: Codec<BootTarget> = {
  parse(value: unknown): BootTarget {
    if (!isRecord(value) || value.target === undefined) {
      return {};
    }
    return { target: resourceParamsCodec.parse(value.target) };
  },
};

/** Per-stack-entry state for a resource list, restored on back-navigation. */
export interface ResourceScreenState {
  readonly cursorKey?: string;
  readonly filter: string;
  readonly sort: SortState | null;
}

export const resourceStateCodec: Codec<ResourceScreenState> = {
  parse(value: unknown): ResourceScreenState {
    if (!isRecord(value)) {
      return { filter: "", sort: null };
    }
    const sort =
      isRecord(value.sort) && typeof value.sort.column === "number"
        ? { column: value.sort.column, desc: value.sort.desc === true }
        : null;
    return {
      cursorKey: typeof value.cursorKey === "string" ? value.cursorKey : undefined,
      filter: typeof value.filter === "string" ? value.filter : "",
      sort,
    };
  },
};

// ---------------------------------------------------------------------------
// Route IDs and navigation helpers
// ---------------------------------------------------------------------------

export const ROUTES = {
  boot: "boot",
  describe: "describe",
  resource: "resource",
} as const;

/** Route shape for `useScreenState` without importing the route (avoids a module cycle). */
export const resourceScreenStateRoute = { id: ROUTES.resource, screenState: resourceStateCodec };

export const openResource = async function openResource(
  router: RouterInstance,
  target: ResourceTarget,
  how: "push" | "reset" = "push",
): Promise<void> {
  await router.navigate({
    params: { kind: target.kind, params: target.params },
    routeId: ROUTES.resource,
    type: how,
  });
};

export const openDescribe = async function openDescribe(
  router: RouterInstance,
  target: DescribeTarget,
): Promise<void> {
  await router.navigate({
    params: { kind: target.kind, label: target.label, params: target.params, row: target.row },
    routeId: ROUTES.describe,
    type: "push",
  });
};
