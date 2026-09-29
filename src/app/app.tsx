import { useCommand } from "@tooee/commands";
import { Outlet, RouterProvider } from "@tooee/router";
import type { RouterInstance } from "@tooee/router";
import { useQuitCommand, useThemeCommands } from "@tooee/shell";
import type { TooeeProviderOptions } from "@tooee/shell";
import type { ReactNode } from "react";

import { useHelpOverlay } from "../ui/help.tsx";
import { useResourcePicker } from "../ui/pickers.tsx";
import { ServicesProvider } from "./services.tsx";
import type { AppServices } from "./services.tsx";

/** Commands that work on every screen. */
const GlobalCommands = function GlobalCommands(): ReactNode {
  const openPicker = useResourcePicker();
  const openHelp = useHelpOverlay();
  useQuitCommand();
  useThemeCommands();
  useCommand({
    handler: () => {
      void openPicker();
    },
    hotkey: ":",
    id: "c9s.resources",
    title: "Jump to resource",
  });
  useCommand({ handler: openHelp, hotkey: "?", id: "c9s.help", title: "Help" });
  return null;
};

export const App = function App({
  services,
  router,
}: {
  services: AppServices;
  router: RouterInstance;
}): ReactNode {
  return (
    <ServicesProvider services={services}>
      <RouterProvider router={router}>
        <GlobalCommands />
        <Outlet />
      </RouterProvider>
    </ServicesProvider>
  );
};

/**
 * Tooee provider options. `:` belongs to the resource picker, as in k9s, so
 * the generic command palette moves to ctrl+p.
 */
export const providerOptions = function providerOptions(theme?: string): TooeeProviderOptions {
  return {
    config: {
      keys: { "command-palette": "ctrl+p" },
      ...(theme === undefined ? {} : { theme: { name: theme } }),
    },
  };
};
