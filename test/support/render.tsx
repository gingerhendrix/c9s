import { createTestRenderer } from "@opentui/core/testing";
import { createRoot } from "@opentui/react";
import { TooeeProvider } from "@tooee/shell";
import type { TooeeProviderOptions } from "@tooee/shell";
import { act } from "react";
import type { ReactNode } from "react";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** Render a node inside Tooee's providers on OpenTUI's headless test renderer. */
export const renderTui = async function renderTui(
  node: ReactNode,
  options: { width?: number; height?: number; provider?: TooeeProviderOptions } = {},
) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const setup = await createTestRenderer({ height: options.height ?? 36, width: options.width ?? 140 });
  const root = createRoot(setup.renderer);
  await act(async () => {
    root.render(<TooeeProvider {...options.provider}>{node}</TooeeProvider>);
    await Promise.resolve();
  });

  const flush = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
    });
    await setup.renderOnce();
  };

  const frame = async (): Promise<string> => {
    await flush();
    return setup.captureCharFrame();
  };

  /** Poll until the frame satisfies `predicate`, flushing React between polls. */
  const waitUntil = async (
    predicate: (frame: string) => boolean,
    label: string,
    timeoutMs = 3000,
  ): Promise<string> => {
    const deadline = Date.now() + timeoutMs;
    let last = "";
    while (Date.now() < deadline) {
      last = await frame();
      if (predicate(last)) {
        return last;
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    throw new Error(`Timed out waiting for ${label}. Last frame:\n${last}`);
  };

  const waitFor = async (text: string | RegExp, timeoutMs = 3000): Promise<string> =>
    await waitUntil(
      (current) => (typeof text === "string" ? current.includes(text) : text.test(current)),
      String(text),
      timeoutMs,
    );

  const press = async (key: string, modifiers?: { shift?: boolean; ctrl?: boolean }): Promise<void> => {
    await act(async () => {
      if (key === "enter") {
        setup.mockInput.pressEnter();
      } else if (key === "escape") {
        setup.mockInput.pressEscape();
      } else {
        setup.mockInput.pressKey(key, modifiers);
      }
      await Promise.resolve();
    });
    await flush();
  };

  const type = async (text: string): Promise<void> => {
    for (const char of text) {
      await press(char);
    }
  };

  const destroy = (): void => {
    act(() => {
      root.unmount();
      setup.renderer.destroy();
    });
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  };

  return { destroy, frame, press, setup, type, waitFor, waitUntil };
};
