import { ChooseHighlightedText, useChooseDialog } from "@tooee/choose";
import { useRouter } from "@tooee/router";
import { useTheme } from "@tooee/themes";
import { useToast } from "@tooee/toasts";
import { useCallback } from "react";

import { openResource } from "../app/navigation.ts";
import { useServices } from "../app/services.tsx";
import { CURATED_KINDS } from "../resources/curated.ts";
import { text } from "../resources/format.ts";
import { extractRows } from "../resources/infer.ts";
import type { ResourceKind } from "../resources/types.ts";
import { BRAND } from "./palette.ts";

/** Width of the name column in the resource picker. */
const NAME_COLUMN = 30;

/** The name typed after `:` for a kind: `zones`, `dns`, `ai-gateway gateways`. */
export const shortName = function shortName(kind: ResourceKind): string {
  if (kind.generic === true) {
    return kind.id.replace(/^cf:/u, "");
  }
  const SHORT: Record<string, string> = {
    "d1-databases": "d1",
    "dns-records": "dns",
    "do-namespaces": "do",
    "do-objects": "objects",
    "kv-keys": "keys",
    "kv-namespaces": "kv",
    "pages-deployments": "deployments",
    "pages-projects": "pages",
    "queue-consumers": "consumers",
    "r2-buckets": "r2",
    "r2-objects": "objects",
    "worker-deployments": "deployments",
    "worker-versions": "versions",
  };
  return SHORT[kind.id] ?? kind.id;
};

const zonesKind = CURATED_KINDS.find((kind) => kind.id === "zones");

interface ZoneChoice {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

/** Ask the user for a zone and make it the session zone. Resolves false on cancel. */
export const useZoneChooser = function useZoneChooser(): () => Promise<boolean> {
  const { cache, session } = useServices();
  const choose = useChooseDialog<ZoneChoice>();
  const { toast } = useToast();

  return useCallback(async () => {
    if (zonesKind === undefined) {
      return false;
    }
    const call = zonesKind.list({}, session.state);
    const zone = await choose.open({
      emptyMessage: "No zones in this account",
      items: async () => {
        const entry = await cache.load({ argv: call.argv, context: { accountId: session.state.accountId } });
        if (entry.result?.kind !== "json") {
          throw new Error(entry.error?.message ?? "Could not load zones");
        }
        return extractRows(entry.result.data).map((row) => ({
          id: text(row.id),
          name: text(row.name),
          status: text(row.status),
        }));
      },
      placeholder: "zone name",
      prompt: "Choose a zone",
      toItem: (choice) => ({ description: choice.status, icon: "◎", text: choice.name }),
    });
    if (zone === null) {
      return false;
    }
    session.useZone(zone.id, zone.name);
    toast({ level: "info", message: `Zone: ${zone.name}` });
    return true;
  }, [cache, choose, session, toast]);
};

/** `:` jumps to any resource kind, k9s-style. */
export const useResourcePicker = function useResourcePicker(): () => Promise<void> {
  const { registry, session } = useServices();
  const router = useRouter();
  const choose = useChooseDialog<ResourceKind>();
  const chooseZone = useZoneChooser();
  const { theme } = useTheme();

  return useCallback(async () => {
    const curatedCount = registry.openable.filter((kind) => kind.generic !== true).length;
    const kind = await choose.open({
      items: registry.openable,
      placeholder: "zones, dns, workers, kv, r2, d1 … or any cf list command",
      prompt: `Resources  (${curatedCount} curated · ${registry.openable.length - curatedCount} from the cf catalogue)`,
      renderItem: ({ item, positions, isActive }) => (
        <text wrapMode="none" fg={isActive ? theme.primary : theme.text} style={{ flexGrow: 1 }}>
          <span fg={item.icon === "·" ? theme.textMuted : BRAND}>{`${item.icon ?? " "} `}</span>
          <ChooseHighlightedText text={item.text} positions={positions} highlightColor={theme.warning} />
          <span>{" ".repeat(Math.max(2, NAME_COLUMN - item.text.length))}</span>
          <span fg={theme.textMuted}>{item.description ?? ""}</span>
        </text>
      ),
      toItem: (candidate) => ({
        description:
          candidate.generic === true
            ? candidate.description
            : `${candidate.title} · ${candidate.description}`,
        icon: candidate.icon,
        text: shortName(candidate),
      }),
    });
    if (kind === null) {
      return;
    }
    if (kind.scope === "zone" && session.state.zoneId === undefined && !(await chooseZone())) {
      return;
    }
    await openResource(router, { kind: kind.id, params: {} }, "reset");
  }, [choose, chooseZone, registry, router, session, theme]);
};
