import type { CfContext } from "../cf/types.ts";
import type { Cell, Row } from "./format.ts";

/** Parameters a resource view needs beyond the session context, e.g. a zone or a namespace. */
export type ResourceParams = Readonly<Record<string, string>>;

/** The account and zone the user is working in. */
export interface SessionContext {
  readonly accountId?: string;
  readonly accountName?: string;
  readonly zoneId?: string;
  readonly zoneName?: string;
}

export interface ColumnSpec {
  readonly id: string;
  /** k9s-style upper-case header. */
  readonly header: string;
  readonly cell: (row: Row) => Cell;
  /** Sort key; defaults to the cell text. */
  readonly sort?: (row: Row) => string | number;
  readonly align?: "left" | "right";
  /** Give this column the spare width (long content such as DNS values). */
  readonly grow?: boolean;
}

/** A resource you can open from a row, e.g. a zone's DNS records. */
export interface ChildLink {
  readonly kind: string;
  readonly title: string;
  /** Hotkey that opens this child. The first child without one opens on Enter. */
  readonly hotkey?: string;
  readonly params: (row: Row) => ResourceParams;
}

/** A `cf` call plus any context it needs beyond the session. */
export interface CfCall {
  readonly argv: readonly string[];
  readonly context?: CfContext;
}

/** What Enter does on a row. */
export type EnterAction = "drill" | "describe" | "use-account";

/**
 * One kind of Cloudflare resource: how to list it, how to show it, and where
 * you can go from it. Curated kinds are hand-tuned; generic kinds come from
 * the cf command catalogue and infer their columns from the data.
 */
export interface ResourceKind {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly icon: string;
  readonly description: string;
  readonly scope: "global" | "account" | "zone";
  /** Names of params this kind needs from a parent row. Kinds with parents are not in the picker. */
  readonly requires?: readonly string[];
  readonly list: (params: ResourceParams, session: SessionContext) => CfCall;
  /** Fixed columns, or `"auto"` to infer them from the rows. */
  readonly columns: readonly ColumnSpec[] | "auto";
  readonly key: (row: Row, index: number) => string;
  /** Short name for breadcrumbs and toasts. */
  readonly label: (row: Row) => string;
  /** Text shown in the table title after the resource name, e.g. the zone. */
  readonly subtitle?: (params: ResourceParams, session: SessionContext) => string | undefined;
  readonly children?: readonly ChildLink[];
  readonly enter?: EnterAction;
  /** The `get` call for a row. When absent, describe shows the list row. */
  readonly describe?: (row: Row, params: ResourceParams) => CfCall | undefined;
  /** Dashboard URL for a row. */
  readonly dashboard?: (row: Row, session: SessionContext, params: ResourceParams) => string | undefined;
  /** Whether a row is the session's current account or zone. */
  readonly current?: (row: Row, session: SessionContext) => boolean;
  /** Pull rows out of the command result; defaults to generic extraction. */
  readonly rows?: (data: unknown) => Row[];
  /** The catalogue command this kind wraps, e.g. `cf zones list`. */
  readonly command: string;
  /** Generic kinds come from the catalogue; curated kinds are hand-written. */
  readonly generic?: boolean;
}
