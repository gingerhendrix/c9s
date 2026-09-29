import { copyToClipboard } from "@tooee/clipboard";
import { useActions, useSetMode } from "@tooee/commands";
import type { ActionDefinition } from "@tooee/commands";
import { useHasModalOverlay } from "@tooee/overlays";
import { useParams, useRouter, useRouterCommands, useScreenState } from "@tooee/router";
import type { SearchState } from "@tooee/search";
import { useDocumentController } from "@tooee/shell";
import type { DocumentRowAdapter, DocumentRowEvent } from "@tooee/shell";
import { useTheme } from "@tooee/themes";
import { useToast } from "@tooee/toasts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useCrumbs } from "../app/crumbs.ts";
import {
  openDescribe,
  openResource,
  resourceParamsCodec,
  resourceScreenStateRoute,
  ROUTES,
} from "../app/navigation.ts";
import type { ResourceTarget } from "../app/navigation.ts";
import { openUrl } from "../app/open-url.ts";
import { useQuery, useServices, useSession } from "../app/services.tsx";
import { buildCfArgs } from "../cf/process-client.ts";
import { formatCommand } from "../cf/types.ts";
import type { CfError } from "../cf/types.ts";
import type { Cell, Row } from "../resources/format.ts";
import { rowSearchText } from "../resources/format.ts";
import { extractRows, inferColumns } from "../resources/infer.ts";
import type { ChildLink, ResourceKind } from "../resources/types.ts";
import type { SortState } from "../resources/view-model.ts";
import { filterIndices, nextSortColumn, sortIndices } from "../resources/view-model.ts";
import type { Hint } from "../ui/header.tsx";
import { useZoneChooser } from "../ui/pickers.tsx";
import { ResourceTable } from "../ui/resource-table.tsx";
import { Notice, Screen } from "../ui/screen.tsx";
import { useSpinner } from "../ui/spinner.ts";

const resourceRouteRef = { id: ROUTES.resource, params: resourceParamsCodec };

/** Keys must be unique for React; repeated keys get a positional suffix. */
const uniqueKeys = (keys: readonly string[]): string[] => {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? key : `${key}#${count}`;
  });
};

/** Explain a failed call in the frame, with the next step to take. */
const errorNotice = (error: CfError, argv: readonly string[]): { title: string; lines: string[] } => {
  const command = formatCommand(argv);
  switch (error.code) {
    case "auth":
      return {
        lines: [
          "Set CLOUDFLARE_API_TOKEN or run `cf auth login`, then press ctrl-r.",
          "To look around without an account: c9s --demo",
        ],
        title: "Not logged in to Cloudflare",
      };
    case "missing-cli":
      return {
        lines: ["npm install -g cf   (needs Node 22 or later)", "To look around without cf: c9s --demo"],
        title: "The cf CLI is not installed",
      };
    case "no-local-equivalent":
      return {
        lines: ["cf --local simulates KV, D1 and R2 state only.", command],
        title: "No local equivalent for this resource",
      };
    default:
      return { lines: [...error.message.split("\n").slice(0, 4), "", command], title: "cf failed" };
  }
};

export const ResourceScreen = function ResourceScreen(): ReactNode {
  const router = useRouter();
  const target = useParams(resourceRouteRef);
  const { registry } = useServices();
  const kind = registry.get(target.kind);
  // Remount per stack entry, so drilling from one list into another starts clean.
  const key = `${router.stack.length}:${JSON.stringify(target)}`;
  if (kind === undefined) {
    return <UnknownKind id={target.kind} />;
  }
  return <ResourceView key={key} kind={kind} target={target} />;
};

const UnknownKind = function UnknownKind({ id }: { id: string }): ReactNode {
  const { theme } = useTheme();
  const crumbs = useCrumbs();
  useRouterCommands();
  return (
    <Screen hints={[{ key: ":", label: "Resources" }]} title="unknown" crumbs={crumbs}>
      <Notice
        title={`Unknown resource: ${id}`}
        lines={["Press : to pick a resource. The cf catalogue may not be installed."]}
        color={theme.error}
      />
    </Screen>
  );
};

const ResourceView = function ResourceView({
  kind,
  target,
}: {
  kind: ResourceKind;
  target: ResourceTarget;
}): ReactNode {
  const services = useServices();
  const session = useSession();
  const router = useRouter();
  const crumbs = useCrumbs();
  const { theme } = useTheme();
  const { toast } = useToast();
  const setMode = useSetMode();
  const overlayOpen = useHasModalOverlay();
  const chooseZone = useZoneChooser();
  useRouterCommands();

  // --- Screen state, restored when you come back to this entry -------------
  const { savedState, saveState } = useScreenState(resourceScreenStateRoute);
  const [filter, setFilter] = useState(savedState?.filter ?? "");
  const [editing, setEditing] = useState(false);
  const [sort, setSort] = useState<SortState | null>(savedState?.sort ?? null);

  // --- Data ----------------------------------------------------------------
  const zone = target.params.zoneId ?? session.zoneId;
  const needsZone = kind.scope === "zone" && zone === undefined;
  const request = useMemo(() => {
    if (needsZone) {
      return null;
    }
    const call = kind.list(target.params, session);
    return {
      argv: call.argv,
      context: { accountId: session.accountId, ...(kind.scope === "zone" ? { zone } : {}), ...call.context },
    };
  }, [kind, target.params, session, needsZone, zone]);

  const { entry, refresh } = useQuery(request, {
    paused: overlayOpen || editing,
    refreshMs: services.options.refreshMs,
  });
  const loading = entry === undefined || (entry.status === "loading" && entry.result === undefined);
  const spinner = useSpinner(request !== null && loading);

  const rows = useMemo(
    () => (entry?.result?.kind === "json" ? (kind.rows ?? extractRows)(entry.result.data) : []),
    [entry?.result, kind],
  );
  const columns = useMemo(() => (kind.columns === "auto" ? inferColumns(rows) : kind.columns), [kind, rows]);
  const cells = useMemo(
    () =>
      rows.map((row) => {
        const rowCells = columns.map((column) => column.cell(row));
        const [firstCell] = rowCells;
        // Mark the current account or zone, like k9s marks the current context.
        if (firstCell !== undefined && kind.current?.(row, session) === true) {
          rowCells[0] = { text: `${firstCell.text} (*)`, tone: "success" };
        }
        return rowCells;
      }),
    [rows, columns, kind, session],
  );
  const texts = useMemo(() => cells.map(rowSearchText), [cells]);
  const keys = useMemo(() => uniqueKeys(rows.map((row, index) => kind.key(row, index))), [rows, kind]);
  const visible = useMemo(
    () =>
      sortIndices(
        filter.trim() === "" ? rows.map((_, index) => index) : filterIndices(texts, filter),
        rows,
        cells,
        columns,
        sort,
      ),
    [filter, texts, rows, cells, columns, sort],
  );
  const visibleRows = useMemo(() => visible.map((index) => rows[index] ?? {}), [visible, rows]);
  const lookup = useMemo(() => {
    const byRow = new Map<Row, { cells: readonly Cell[]; key: string; text: string }>();
    rows.forEach((row, index) => {
      byRow.set(row, {
        cells: cells[index] ?? [],
        key: keys[index] ?? String(index),
        text: texts[index] ?? "",
      });
    });
    return byRow;
  }, [rows, cells, keys, texts]);
  const cellMap = useMemo(() => new Map([...lookup].map(([row, value]) => [row, value.cells])), [lookup]);

  // --- Row actions -----------------------------------------------------------
  const enterChild: ChildLink | undefined = kind.children?.find((child) => child.hotkey === undefined);

  const describe = (row: Row): void => {
    void openDescribe(router, { kind: kind.id, label: kind.label(row), params: target.params, row });
  };

  const openChild = (row: Row, child: ChildLink): void => {
    if (kind.id === "zones") {
      services.session.useZone(String(row.id ?? ""), String(row.name ?? ""));
    }
    void openResource(router, { kind: child.kind, params: { ...target.params, ...child.params(row) } });
  };

  const open = (row: Row): void => {
    if (kind.enter === "use-account") {
      const accountId = String(row.id ?? "");
      const name = kind.label(row);
      services.session.useAccount(accountId, name);
      toast({ level: "success", message: `Account: ${name}` });
      void openResource(router, { kind: "zones", params: {} }, "reset");
      return;
    }
    if (kind.enter === "drill" && enterChild !== undefined) {
      openChild(row, enterChild);
      return;
    }
    describe(row);
  };

  const lastActiveKey = useRef<string | null>(null);
  const adapter = useMemo<DocumentRowAdapter<Row>>(
    () => ({
      getKey: (row) => lookup.get(row)?.key ?? "",
      getText: (row) => lookup.get(row)?.text ?? "",
    }),
    [lookup],
  );
  const controller = useDocumentController<Row>({
    adapter,
    multiSelect: false,
    onRowPress: (event: DocumentRowEvent<Row>) => {
      // A click on the row that was already active opens it.
      if (lastActiveKey.current === String(event.key)) {
        open(event.row);
      }
    },
    preserveCursorByKey: true,
    rows: visibleRows,
    search: false,
  });
  lastActiveKey.current = controller.activeKey === null ? null : String(controller.activeKey);
  const activeRow = controller.activeRow;

  // Restore the cursor once rows arrive, then remember where it is.
  const restored = useRef(savedState?.cursorKey === undefined);
  useEffect(() => {
    if (restored.current || visibleRows.length === 0) {
      return;
    }
    restored.current = true;
    const index = visibleRows.findIndex((row) => lookup.get(row)?.key === savedState?.cursorKey);
    if (index > 0) {
      controller.selectRow(index);
    }
  }, [visibleRows, lookup, savedState?.cursorKey, controller]);
  useEffect(() => {
    saveState({
      cursorKey: controller.activeKey === null ? savedState?.cursorKey : String(controller.activeKey),
      filter,
      sort,
    });
  }, [controller.activeKey, filter, sort, saveState, savedState?.cursorKey]);

  // Tell the user when a background refresh fails; the stale rows stay visible.
  const lastError = useRef<CfError | undefined>(undefined);
  useEffect(() => {
    if (entry?.error !== undefined && entry.result !== undefined && entry.error !== lastError.current) {
      toast({ level: "error", message: `Refresh failed: ${entry.error.message.split("\n")[0] ?? ""}` });
    }
    lastError.current = entry?.error;
  }, [entry?.error, entry?.result, toast]);

  // --- Filter (k9s `/`) --------------------------------------------------------
  const stopEditing = (): void => {
    setEditing(false);
    setMode("cursor");
  };
  const filterState: SearchState | undefined = editing
    ? {
        currentMatchIndex: controller.activeIndex ?? 0,
        matchingLines: visible,
        searchActive: true,
        searchQuery: filter,
        setSearchQuery: setFilter,
        submitSearch: stopEditing,
      }
    : undefined;

  // --- Commands -------------------------------------------------------------
  const hasRow = (): boolean => controller.activeRow !== undefined;
  const actions: ActionDefinition[] = [
    {
      handler: () => {
        if (needsZone) {
          void chooseZone();
        } else if (activeRow !== undefined) {
          open(activeRow);
        }
      },
      hotkey: "enter",
      id: "resource.open",
      title: kind.enter === "use-account" ? "Use account" : (enterChild?.title ?? "Describe"),
    },
    {
      handler: () => {
        if (activeRow !== undefined) {
          describe(activeRow);
        }
      },
      hotkey: "d",
      id: "resource.describe",
      title: "Describe",
      when: hasRow,
    },
    ...(kind.children ?? [])
      .filter((child) => child.hotkey !== undefined)
      .map((child): ActionDefinition => ({
        handler: () => {
          if (activeRow !== undefined) {
            openChild(activeRow, child);
          }
        },
        hotkey: child.hotkey,
        id: `resource.child.${child.kind}`,
        title: child.title,
        when: hasRow,
      })),
    {
      handler: () => {
        setEditing(true);
        setMode("insert");
      },
      hotkey: "/",
      id: "resource.filter",
      title: "Filter",
    },
    {
      handler: () => {
        setFilter("");
        stopEditing();
      },
      hotkey: "escape",
      id: "resource.filter.cancel",
      modes: ["insert"],
      title: "Cancel filter",
      when: () => editing,
    },
    {
      handler: () => {
        if (filter !== "") {
          setFilter("");
        } else if (router.canGoBack()) {
          void router.pop();
        }
      },
      hotkey: "escape",
      id: "resource.back",
      title: "Clear filter / back",
      when: () => filter !== "" || router.canGoBack(),
    },
    {
      handler: () => {
        setSort((current) => nextSortColumn(current, columns.length));
      },
      hotkey: "s",
      id: "resource.sort",
      title: "Sort by next column",
    },
    {
      handler: () => {
        setSort((current) =>
          current === null ? { column: 0, desc: true } : { ...current, desc: !current.desc },
        );
      },
      hotkey: "shift+s",
      id: "resource.sort.reverse",
      title: "Reverse sort",
    },
    {
      handler: () => {
        if (activeRow === undefined) {
          return;
        }
        const id = kind.key(activeRow, controller.activeIndex ?? 0);
        void copyToClipboard(id).then(
          () => {
            toast({ level: "success", message: `Copied ${id}` });
          },
          () => {
            toast({ level: "error", message: "Clipboard unavailable" });
          },
        );
      },
      hotkey: "c",
      id: "resource.copy",
      title: "Copy ID",
      when: hasRow,
    },
    {
      handler: () => {
        if (activeRow === undefined) {
          return;
        }
        const url = kind.dashboard?.(activeRow, session, target.params);
        if (url === undefined) {
          toast({ level: "warning", message: `No dashboard link for ${kind.title}` });
        } else if (services.client.mode === "demo") {
          toast({ level: "info", message: `Demo mode: ${url}` });
        } else if (openUrl(url)) {
          toast({ level: "success", message: "Opened the Cloudflare dashboard" });
        } else {
          toast({ level: "warning", message: url });
        }
      },
      hotkey: "o",
      id: "resource.dashboard",
      title: "Open in dashboard",
      when: hasRow,
    },
    {
      handler: () => {
        refresh();
      },
      hotkey: "ctrl+r",
      id: "resource.refresh",
      title: "Refresh",
    },
  ];
  useActions(actions);

  // --- Chrome ---------------------------------------------------------------
  const hints: Hint[] = [
    {
      key: "enter",
      label: needsZone
        ? "Choose zone"
        : kind.enter === "use-account"
          ? "Use account"
          : (enterChild?.title ?? "Describe"),
    },
    ...(kind.enter === "describe" || needsZone ? [] : [{ key: "d", label: "Describe" }]),
    ...(kind.children ?? [])
      .filter((child) => child.hotkey !== undefined)
      .map((child) => ({ key: (child.hotkey ?? "").replace("+", "-"), label: child.title })),
    { key: "/", label: "Filter" },
    { key: "s", label: "Sort" },
    { key: "c", label: "Copy ID" },
    { key: "o", label: "Dashboard" },
    { key: ":", label: "Resources" },
    { key: "ctrl-r", label: "Refresh" },
    { key: "esc", label: "Back" },
    { key: "?", label: "Help" },
    { key: "q", label: "Quit" },
  ];

  const scopeLabel =
    kind.subtitle?.(target.params, session) ??
    (kind.scope === "zone" ? session.zoneName : kind.scope === "account" ? session.accountName : "all");
  const count = filter === "" ? `${rows.length}` : `${visible.length}/${rows.length}`;
  const refreshing = entry?.fetching === true && entry.result !== undefined;
  const title = [
    `${kind.title}${scopeLabel === undefined ? "" : `(${scopeLabel})`}[${count}]`,
    filter === "" ? "" : ` </${filter}>`,
    refreshing ? " ↻" : "",
  ].join("");

  const status = [
    {
      label: "Row:",
      value: `${controller.activeIndex === null ? 0 : controller.activeIndex + 1}/${visible.length}`,
    },
    ...(filter === "" ? [] : [{ label: "Filter:", value: filter }]),
    ...(sort === null
      ? []
      : [{ label: "Sort:", value: `${columns[sort.column]?.header ?? ""} ${sort.desc ? "↓" : "↑"}` }]),
    ...(entry?.durationMs === undefined ? [] : [{ label: "Took:", value: `${entry.durationMs}ms` }]),
  ];
  const command =
    request === null
      ? undefined
      : formatCommand(buildCfArgs(request, { local: services.client.mode === "local" }));

  let body: ReactNode;
  if (needsZone) {
    body = (
      <Notice
        title="Choose a zone"
        lines={[`${kind.title} belong to a zone.`, "Press enter to choose one, or open :zones."]}
        color={theme.warning}
      />
    );
  } else if (entry?.status === "error" && entry.error !== undefined && entry.result === undefined) {
    const notice = errorNotice(entry.error, request?.argv ?? []);
    body = <Notice title={notice.title} lines={notice.lines} color={theme.error} />;
  } else if (loading) {
    body = (
      <Notice
        title={`${spinner} Loading ${kind.title.toLowerCase()}…`}
        lines={request === null ? [] : [formatCommand(request.argv)]}
        color={theme.primary}
      />
    );
  } else if (entry?.result?.kind === "text") {
    body = <Notice title="cf printed text, not JSON" lines={entry.result.text.split("\n").slice(0, 10)} />;
  } else {
    body = (
      <ResourceTable
        columns={columns}
        cells={cellMap}
        controller={controller}
        sort={sort}
        emptyText={filter === "" ? `No ${kind.title.toLowerCase()} found` : `No rows match /${filter}`}
      />
    );
  }

  return (
    <Screen
      hints={hints}
      title={title}
      crumbs={crumbs}
      command={command}
      status={status}
      filter={filterState}
      busy={refreshing || (loading && request !== null)}
    >
      {body}
    </Screen>
  );
};
