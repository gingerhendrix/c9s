import { useTerminalDimensions } from "@opentui/react";
import { useTheme } from "@tooee/themes";
import type { ReactNode } from "react";

import { usePromise, useServices, useSession } from "../app/services.tsx";
import type { CfMode } from "../cf/types.ts";
import { BRAND } from "./palette.ts";

export interface Hint {
  readonly key: string;
  readonly label: string;
}

const HINT_ROWS = 6;
const LOGO_WIDTH = 28;

const MODE_LABELS: Record<CfMode, { text: string; tone: "success" | "warning" | "info" }> = {
  demo: { text: "demo (fixtures)", tone: "warning" },
  live: { text: "live", tone: "success" },
  local: { text: "local (miniflare)", tone: "info" },
};

const ContextLine = function ContextLine({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  color?: string;
}): ReactNode {
  const { theme } = useTheme();
  return (
    <text>
      <span fg={BRAND}>{label.padEnd(9)}</span>
      <span fg={color ?? theme.text}>
        <strong>{value}</strong>
      </span>
      {detail === undefined ? null : <span fg={theme.textMuted}>{` ${detail}`}</span>}
    </text>
  );
};

/**
 * The k9s-style header: context on the left, the current screen's hotkeys in
 * the middle, and the logo on the right.
 */
export const Header = function Header({ hints }: { hints: readonly Hint[] }): ReactNode {
  const { theme } = useTheme();
  const { client, options } = useServices();
  const session = useSession();
  const cfVersion = usePromise(options.cfVersion);
  const { width } = useTerminalDimensions();
  const mode = MODE_LABELS[client.mode];
  const showLogo = width >= 110;

  const columns: Hint[][] = [];
  for (let index = 0; index < hints.length; index += HINT_ROWS) {
    columns.push(hints.slice(index, index + HINT_ROWS));
  }
  const hintWidth = Math.max(...hints.map((hint) => hint.key.length + hint.label.length + 3), 0);

  return (
    <box flexDirection="row" flexShrink={0} height={HINT_ROWS} paddingLeft={1} paddingRight={1}>
      <box flexDirection="column" width={38} flexShrink={0}>
        <ContextLine
          label="Account:"
          value={session.accountName ?? session.accountId?.slice(0, 12) ?? "none"}
          color={session.accountId === undefined ? theme.textMuted : theme.text}
        />
        <ContextLine
          label="Zone:"
          value={session.zoneName ?? "none"}
          color={session.zoneName === undefined ? theme.textMuted : theme.text}
        />
        <ContextLine label="Source:" value={mode.text} color={theme[mode.tone]} />
        <ContextLine label="cf:" value={cfVersion === undefined ? "…" : `v${cfVersion}`} />
        <ContextLine label="c9s:" value={`v${options.version}`} />
        <ContextLine
          label="Refresh:"
          value={options.refreshMs > 0 ? `${Math.round(options.refreshMs / 1000)}s` : "off"}
          color={theme.textMuted}
        />
      </box>
      <box flexDirection="row" flexGrow={1} overflow="hidden" gap={2}>
        {columns.map((column, columnIndex): ReactNode => (
          <box key={columnIndex} flexDirection="column" width={hintWidth} flexShrink={0}>
            {column.map((hint): ReactNode => (
              <text key={hint.key}>
                <span fg={theme.primary}>{`<${hint.key}>`}</span>
                <span fg={theme.textMuted}>{` ${hint.label}`}</span>
              </text>
            ))}
          </box>
        ))}
      </box>
      {showLogo ? (
        <box width={LOGO_WIDTH} flexShrink={0} alignItems="flex-end">
          <ascii-font text="c9s" font="block" color={BRAND} />
        </box>
      ) : null}
    </box>
  );
};
