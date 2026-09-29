import { copyToClipboard } from "@tooee/clipboard";
import { useActions } from "@tooee/commands";
import type { ActionDefinition } from "@tooee/commands";
import { DEFAULT_SIGN_COLUMN_WIDTH, useGutterPalette } from "@tooee/renderers";
import { useParams, useRouter, useRouterCommands } from "@tooee/router";
import { Document, useDocumentController } from "@tooee/shell";
import type { DocumentRowAdapter } from "@tooee/shell";
import { useTheme } from "@tooee/themes";
import { useToast } from "@tooee/toasts";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useCrumbs } from "../app/crumbs.ts";
import { describeParamsCodec, ROUTES } from "../app/navigation.ts";
import { useQuery, useServices, useSession } from "../app/services.tsx";
import { buildCfArgs } from "../cf/process-client.ts";
import { formatCommand } from "../cf/types.ts";
import type { Hint } from "../ui/header.tsx";
import { highlightLine, renderDocument } from "../ui/highlight.ts";
import type { DocumentFormat } from "../ui/highlight.ts";
import { toneColor } from "../ui/palette.ts";
import { Screen } from "../ui/screen.tsx";
import { useSpinner } from "../ui/spinner.ts";

const describeRouteRef = { id: ROUTES.describe, params: describeParamsCodec };

interface Line {
  readonly index: number;
  readonly text: string;
}

const lineAdapter: DocumentRowAdapter<Line> = {
  getKey: (line) => line.index,
  getText: (line) => line.text,
};

/** Parse text output as JSON when it is JSON (KV values often are). */
const asValue = (text: string): { value: unknown; structured: boolean } => {
  try {
    return { structured: true, value: JSON.parse(text) };
  } catch {
    return { structured: false, value: text };
  }
};

/**
 * k9s `d`: the full resource as highlighted JSON or YAML. The list row shows
 * at once; the `get` call replaces it when it returns.
 */
export const DescribeScreen = function DescribeScreen(): ReactNode {
  const target = useParams(describeRouteRef);
  const router = useRouter();
  const { registry, client } = useServices();
  const session = useSession();
  const crumbs = useCrumbs();
  const { theme } = useTheme();
  const gutterPalette = useGutterPalette();
  const palette = useMemo(
    () => ({ ...gutterPalette, gutterBg: theme.background }),
    [gutterPalette, theme.background],
  );
  const { toast } = useToast();
  useRouterCommands();

  const [format, setFormat] = useState<"json" | "yaml">("yaml");
  const [wrap, setWrap] = useState(false);

  const kind = registry.get(target.kind);
  const call = kind?.describe?.(target.row, target.params);
  const request = useMemo(
    () =>
      call === undefined
        ? null
        : {
            argv: call.argv,
            context: { accountId: session.accountId, zone: session.zoneId, ...call.context },
          },
    // The call is derived from stable route params; key on its argv.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(call), session.accountId, session.zoneId],
  );
  const { entry, refresh } = useQuery(request, { staleMs: 5000 });
  const fetching = request !== null && (entry === undefined || entry.fetching);
  const spinner = useSpinner(fetching);

  // Prefer the fetched resource; fall back to the list row while it loads or if it fails.
  const { value, docFormat, source } = useMemo((): {
    value: unknown;
    docFormat: DocumentFormat;
    source: string;
  } => {
    const result = entry?.result;
    if (result?.kind === "json") {
      return { docFormat: format, source: "get", value: result.data };
    }
    if (result?.kind === "text") {
      const parsed = asValue(result.text);
      return { docFormat: parsed.structured ? format : "text", source: "value", value: parsed.value };
    }
    return { docFormat: format, source: "list row", value: target.row };
  }, [entry?.result, format, target.row]);

  const lines = useMemo<Line[]>(
    () => renderDocument(value, docFormat).map((text, index) => ({ index, text })),
    [value, docFormat],
  );

  const controller = useDocumentController<Line>({ adapter: lineAdapter, multiSelect: true, rows: lines });

  const actions: ActionDefinition[] = [
    {
      handler: () => {
        setFormat((current) => (current === "json" ? "yaml" : "json"));
      },
      hotkey: "f",
      id: "describe.format",
      title: "Toggle JSON / YAML",
    },
    {
      handler: () => {
        setWrap((current) => !current);
      },
      hotkey: "w",
      id: "describe.wrap",
      title: "Toggle wrap",
    },
    {
      handler: () => {
        void copyToClipboard(lines.map((line) => line.text).join("\n")).then(
          () => {
            toast({ level: "success", message: `Copied ${lines.length} lines` });
          },
          () => {
            toast({ level: "error", message: "Clipboard unavailable" });
          },
        );
      },
      hotkey: "c",
      id: "describe.copy",
      title: "Copy document",
    },
    {
      handler: () => {
        void router.pop();
      },
      hotkey: "escape",
      id: "describe.back",
      title: "Back",
      when: () => router.canGoBack() && controller.search?.searchActive !== true,
    },
    {
      handler: () => {
        refresh();
      },
      hotkey: "ctrl+r",
      id: "describe.refresh",
      title: "Refresh",
    },
  ];
  useActions(actions);

  const hints: Hint[] = [
    { key: "f", label: format === "json" ? "YAML" : "JSON" },
    { key: "w", label: wrap ? "No wrap" : "Wrap" },
    { key: "/", label: "Search" },
    { key: "n", label: "Next match" },
    { key: "c", label: "Copy" },
    { key: "ctrl-r", label: "Refresh" },
    { key: "esc", label: "Back" },
    { key: ":", label: "Resources" },
    { key: "?", label: "Help" },
  ];

  const kindTitle = kind?.title ?? target.kind;
  const title = `Describe(${kindTitle.toLowerCase()}/${target.label})${fetching ? ` ${spinner}` : ""}`;
  const status = [
    { label: "Line:", value: `${(controller.activeIndex ?? 0) + 1}/${lines.length}` },
    { label: "Source:", value: source },
    ...(entry?.error === undefined
      ? []
      : [{ label: "Error:", value: entry.error.message.split("\n")[0] ?? "" }]),
  ];

  return (
    <Screen
      hints={hints}
      title={title}
      crumbs={crumbs}
      command={
        request === null ? undefined : formatCommand(buildCfArgs(request, { local: client.mode === "local" }))
      }
      status={status}
      filter={controller.search ?? undefined}
    >
      <Document
        controller={controller}
        mode="multi"
        showGutter
        showLineNumbers
        signColumnWidth={DEFAULT_SIGN_COLUMN_WIDTH}
        palette={palette}
        style={{ flexGrow: 1 }}
        renderRow={(line): ReactNode => (
          <text wrapMode={wrap ? "char" : "none"}>
            {highlightLine(line.text, docFormat).map((span, index): ReactNode => (
              <span key={index} fg={toneColor(theme, span.tone)}>
                {span.text}
              </span>
            ))}
          </text>
        )}
      />
    </Screen>
  );
};
