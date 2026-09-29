import { useCommand } from "@tooee/commands";
import { useParams, useRouter } from "@tooee/router";
import { useTheme } from "@tooee/themes";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { bootParamsCodec, openResource, ROUTES } from "../app/navigation.ts";
import type { ResourceTarget } from "../app/navigation.ts";
import { useServices } from "../app/services.tsx";
import { CfError } from "../cf/types.ts";
import { text } from "../resources/format.ts";
import { extractRows } from "../resources/infer.ts";
import { BRAND } from "../ui/palette.ts";
import { useSpinner } from "../ui/spinner.ts";

const bootRouteRef = { id: ROUTES.boot, params: bootParamsCodec };

type StepState = "running" | "done" | "failed" | "skipped";

interface Step {
  readonly label: string;
  readonly state: StepState;
  readonly detail?: string;
}

const DEFAULT_TARGET: ResourceTarget = { kind: "zones", params: {} };
const LOCAL_TARGET: ResourceTarget = { kind: "kv-namespaces", params: {} };

/**
 * The splash screen. It finds the cf version and the account to work in,
 * then replaces itself with the first resource view.
 */
export const BootScreen = function BootScreen(): ReactNode {
  const { target } = useParams(bootRouteRef);
  const services = useServices();
  const router = useRouter();
  const { theme } = useTheme();
  const [steps, setSteps] = useState<Step[]>([]);
  const [failure, setFailure] = useState<CfError | null>(null);
  const [next, setNext] = useState<ResourceTarget | null>(null);
  const spinner = useSpinner(failure === null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const began = Date.now();
    const { client, session, cache, options } = services;

    const update = (label: string, state: StepState, detail?: string): void => {
      setSteps((current) => {
        const index = current.findIndex((step) => step.label === label);
        const step = { detail, label, state };
        if (index === -1) {
          return [...current, step];
        }
        const copy = [...current];
        copy[index] = step;
        return copy;
      });
    };

    const finish = async (destination: ResourceTarget): Promise<void> => {
      const wait = options.splashMs - (Date.now() - began);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      await openResource(router, destination, "reset");
    };

    void (async () => {
      update("cf CLI", "running");
      try {
        const version = await options.cfVersion;
        update(
          "cf CLI",
          "done",
          client.mode === "demo" ? `demo fixtures (cf v${version} shape)` : `v${version}`,
        );
      } catch (error) {
        update("cf CLI", "failed");
        setFailure(error instanceof CfError ? error : new CfError(String(error)));
        setNext(target ?? DEFAULT_TARGET);
        return;
      }

      if (client.mode === "local") {
        update("Account", "skipped", "local mode uses Miniflare state");
        await finish(target ?? LOCAL_TARGET);
        return;
      }

      update("Account", "running");
      const entry = await cache.load({ argv: ["accounts", "list", "--per-page", "50"] });
      if (entry.result?.kind !== "json") {
        update("Account", "failed");
        setFailure(entry.error ?? new CfError("cf returned no accounts"));
        setNext(target ?? DEFAULT_TARGET);
        return;
      }
      const accounts = extractRows(entry.result.data);
      const preset = session.state.accountId;
      if (preset !== undefined) {
        const match = accounts.find((account) => account.id === preset);
        session.useAccount(preset, match === undefined ? undefined : text(match.name));
        update("Account", "done", match === undefined ? preset : text(match.name));
        await finish(target ?? DEFAULT_TARGET);
      } else if (accounts.length === 1 && accounts[0] !== undefined) {
        session.useAccount(text(accounts[0].id), text(accounts[0].name));
        update("Account", "done", text(accounts[0].name));
        await finish(target ?? DEFAULT_TARGET);
      } else if (accounts.length > 1) {
        update("Account", "done", `${accounts.length} accounts, choose one`);
        await finish({ kind: "accounts", params: {} });
      } else {
        update("Account", "failed", "this token can see no accounts");
        await finish(target ?? DEFAULT_TARGET);
      }
    })();
  }, [services, router, target]);

  useCommand({
    handler: () => {
      if (next !== null) {
        void openResource(router, next, "reset");
      }
    },
    hotkey: "enter",
    id: "boot.continue",
    title: "Continue",
    when: () => next !== null,
  });

  const icon = (state: StepState): { glyph: string; color: string } => {
    switch (state) {
      case "done":
        return { color: theme.success, glyph: "✓" };
      case "failed":
        return { color: theme.error, glyph: "✗" };
      case "skipped":
        return { color: theme.textMuted, glyph: "–" };
      default:
        return { color: BRAND, glyph: spinner };
    }
  };

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.background}
    >
      <ascii-font text="c9s" font="huge" color={BRAND} />
      <text fg={theme.textMuted} marginTop={1}>
        Cloudflare in your terminal · built with <span fg={theme.primary}>Tooee</span> on the{" "}
        <span fg={BRAND}>cf</span> CLI
      </text>
      <box flexDirection="column" marginTop={1} width={60}>
        {steps.map((step): ReactNode => {
          const { glyph, color } = icon(step.state);
          return (
            <text key={step.label}>
              <span fg={color}>{`${glyph} `}</span>
              <span fg={theme.text}>{step.label.padEnd(10)}</span>
              <span fg={theme.textMuted}>{step.detail ?? ""}</span>
            </text>
          );
        })}
      </box>
      {failure === null ? null : (
        <box
          flexDirection="column"
          marginTop={1}
          width={72}
          border
          borderStyle="rounded"
          borderColor={theme.error}
          paddingLeft={1}
          paddingRight={1}
        >
          <text fg={theme.error}>
            <strong>{failure.code === "auth" ? "Not logged in to Cloudflare" : "cf failed"}</strong>
          </text>
          {failure.message
            .split("\n")
            .slice(0, 4)
            .map((line, index): ReactNode => (
              <text key={index} fg={theme.textMuted} content={line} />
            ))}
          <text fg={theme.text} marginTop={1}>
            {failure.code === "auth"
              ? "Set CLOUDFLARE_API_TOKEN or run `cf auth login`. Try `c9s --demo` to explore offline."
              : "Try `c9s --demo` to explore offline."}
          </text>
          <text fg={theme.textMuted} content="enter continue · q quit" />
        </box>
      )}
    </box>
  );
};
