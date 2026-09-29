import { useTerminalDimensions } from "@opentui/react";
import { useMode } from "@tooee/commands";
import { AppLayout } from "@tooee/layout";
import type { StatusBarItem } from "@tooee/layout";
import type { SearchState } from "@tooee/search";
import { useTheme } from "@tooee/themes";
import type { ReactNode } from "react";

import { useServices } from "../app/services.tsx";
import { truncate } from "../resources/view-model.ts";
import { Header } from "./header.tsx";
import type { Hint } from "./header.tsx";
import { BRAND } from "./palette.ts";

export interface Crumb {
  readonly text: string;
}

/**
 * k9s-style breadcrumbs, one pill per router stack entry, with the `cf`
 * command behind the current view on the right.
 */
export const Crumbs = function Crumbs({
  items,
  command,
}: {
  items: readonly Crumb[];
  command?: string;
}): ReactNode {
  const { theme } = useTheme();
  const { width } = useTerminalDimensions();
  const used = items.reduce((sum, item) => sum + item.text.length + 5, 2);
  const room = width - used - 3;
  return (
    <box flexDirection="row" flexShrink={0} height={1} paddingLeft={1} paddingRight={1} gap={1}>
      {items.map((item, index): ReactNode => {
        const last = index === items.length - 1;
        return (
          <text
            key={`${index}:${item.text}`}
            bg={last ? BRAND : theme.backgroundElement}
            fg={last ? "#000000" : theme.textMuted}
          >
            {last ? <strong>{` <${item.text}> `}</strong> : ` <${item.text}> `}
          </text>
        );
      })}
      <box flexGrow={1} />
      {command === undefined || room < 12 ? null : (
        <text fg={theme.textMuted}>
          <span fg={BRAND}>$ </span>
          {truncate(command, room - 2)}
        </text>
      )}
    </box>
  );
};

export interface ScreenProps {
  readonly hints: readonly Hint[];
  /** Title in the frame's top border. */
  readonly title: string;
  readonly crumbs: readonly Crumb[];
  /** The `cf` command behind this view, shown beside the breadcrumbs. */
  readonly command?: string;
  /** Screen-specific status items, shown before Mode. */
  readonly status?: readonly StatusBarItem[];
  /** When set, the bottom bar becomes a filter input. */
  readonly filter?: SearchState;
  readonly busy?: boolean;
  readonly children: ReactNode;
}

/** Shared chrome: header, framed body, breadcrumbs, then Tooee's status/search bar. */
export const Screen = function Screen({
  hints,
  title,
  crumbs,
  command,
  status,
  filter,
  busy,
  children,
}: ScreenProps): ReactNode {
  const { theme, name } = useTheme();
  const mode = useMode();
  const { client } = useServices();

  const items: StatusBarItem[] = [
    { label: "c9s", value: client.mode },
    ...(status ?? []),
    { label: "Theme:", value: name },
    { label: "Mode:", value: mode },
  ];

  return (
    <AppLayout statusBar={{ items }} searchBar={filter}>
      <box flexDirection="column" width="100%" height="100%">
        <Header hints={hints} />
        <box
          flexGrow={1}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={busy === true ? BRAND : theme.border}
          title={` ${title} `}
          titleAlignment="center"
          titleColor={theme.primary}
          marginLeft={1}
          marginRight={1}
        >
          {children}
        </box>
        <Crumbs items={crumbs} command={command} />
      </box>
    </AppLayout>
  );
};

/** Centered message inside a frame, for loading, empty and error states. */
export const Notice = function Notice({
  title,
  lines,
  color,
}: {
  title: string;
  lines?: readonly string[];
  color?: string;
}): ReactNode {
  const { theme } = useTheme();
  return (
    <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
      <text fg={color ?? theme.text}>
        <strong>{title}</strong>
      </text>
      {(lines ?? []).map((line, index): ReactNode => (
        <text key={index} fg={theme.textMuted} content={line} />
      ))}
    </box>
  );
};
