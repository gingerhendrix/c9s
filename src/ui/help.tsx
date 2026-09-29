import { useCommand } from "@tooee/commands";
import { useOverlay } from "@tooee/overlays";
import { useTheme } from "@tooee/themes";
import { useCallback } from "react";
import type { ReactNode } from "react";

import { BRAND } from "./palette.ts";

interface Section {
  readonly title: string;
  readonly keys: readonly (readonly [string, string])[];
}

export const HELP_SECTIONS: readonly Section[] = [
  {
    keys: [
      ["enter", "Open / drill down"],
      ["d", "Describe"],
      ["shift-d", "Worker deployments"],
      ["/", "Filter rows"],
      ["esc", "Clear filter / back"],
      ["s", "Sort by next column"],
      ["shift-s", "Reverse sort"],
      ["c", "Copy ID"],
      ["o", "Open in dashboard"],
      ["ctrl-r", "Refresh"],
    ],
    title: "RESOURCE",
  },
  {
    keys: [
      [":", "Jump to resource"],
      ["?", "This help"],
      ["t", "Theme"],
      ["ctrl-p", "Command palette"],
      ["q", "Quit"],
    ],
    title: "GENERAL",
  },
  {
    keys: [
      ["j / k", "Down / up"],
      ["g g", "Top"],
      ["shift-g", "Bottom"],
      ["ctrl-d / ctrl-u", "Page down / up"],
      ["backspace", "Back"],
      ["mouse", "Click to select"],
    ],
    title: "NAVIGATION",
  },
  {
    keys: [
      ["f", "JSON / YAML"],
      ["w", "Wrap lines"],
      ["/", "Search"],
      ["n / shift-n", "Next / previous match"],
      ["c", "Copy document"],
    ],
    title: "DESCRIBE",
  },
];

const HelpSection = function HelpSection({ section }: { section: Section }): ReactNode {
  const { theme } = useTheme();
  const keyWidth = Math.max(...section.keys.map(([key]) => key.length)) + 3;
  return (
    <box flexDirection="column" width={keyWidth + 22}>
      <text fg={BRAND}>
        <strong>{section.title}</strong>
      </text>
      {section.keys.map(([key, label]): ReactNode => (
        <text key={key}>
          <span fg={theme.primary}>{`<${key}>`.padEnd(keyWidth)}</span>
          <span fg={theme.text}>{label}</span>
        </text>
      ))}
    </box>
  );
};

const HelpPanel = function HelpPanel({ close }: { close: () => void }): ReactNode {
  const { theme } = useTheme();
  useCommand({ handler: close, hotkey: "escape", id: "help.escape", title: "Close help" });
  useCommand({ handler: close, hotkey: "q", id: "help.close", title: "Close help" });
  useCommand({ handler: close, hotkey: "?", id: "help.toggle", title: "Close help" });

  const rows = [HELP_SECTIONS.slice(0, 2), HELP_SECTIONS.slice(2, 4)];
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      alignItems="center"
      justifyContent="center"
    >
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={BRAND}
        title=" c9s keys "
        titleAlignment="center"
        backgroundColor={theme.backgroundPanel}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        gap={1}
      >
        {rows.map((row, index): ReactNode => (
          <box key={index} flexDirection="row" gap={4}>
            {row.map((section): ReactNode => (
              <HelpSection key={section.title} section={section} />
            ))}
          </box>
        ))}
        <text fg={theme.textMuted} content="esc, q or ? to close" />
      </box>
    </box>
  );
};

/** `?` opens a k9s-style keyboard reference. */
export const useHelpOverlay = function useHelpOverlay(): () => void {
  const overlay = useOverlay();
  return useCallback(() => {
    overlay.open("c9s.help", ({ close }) => <HelpPanel close={() => close()} />, null, {
      ownCommands: true,
      role: "modal",
      surfaceMode: "cursor",
    });
  }, [overlay]);
};
