import { useRouter } from "@tooee/router";

import type { Crumb } from "../ui/screen.tsx";
import { shortName } from "../ui/pickers.tsx";
import { describeParamsCodec, resourceParamsCodec, ROUTES } from "./navigation.ts";
import { useServices, useSession } from "./services.tsx";

/** One breadcrumb per router stack entry: `zones`, `dns(acme.dev)`, `describe(www.acme.dev)`. */
export const useCrumbs = function useCrumbs(): Crumb[] {
  const router = useRouter();
  const { registry } = useServices();
  const session = useSession();

  const crumbs: Crumb[] = [];
  for (const entry of router.stack) {
    if (entry.routeId === ROUTES.resource) {
      const target = resourceParamsCodec.parse(entry.params);
      const kind = registry.get(target.kind);
      if (kind === undefined) {
        continue;
      }
      const subtitle = kind.subtitle?.(target.params, session);
      crumbs.push({ text: subtitle === undefined ? shortName(kind) : `${shortName(kind)}(${subtitle})` });
    } else if (entry.routeId === ROUTES.describe) {
      const target = describeParamsCodec.parse(entry.params);
      crumbs.push({ text: `describe(${target.label})` });
    }
  }
  return crumbs;
};
