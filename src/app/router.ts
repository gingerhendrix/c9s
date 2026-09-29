import { createRoute, createRouter } from "@tooee/router";

import { BootScreen } from "../routes/boot-screen.tsx";
import { DescribeScreen } from "../routes/describe-screen.tsx";
import { ResourceScreen } from "../routes/resource-screen.tsx";
import {
  bootParamsCodec,
  describeParamsCodec,
  resourceParamsCodec,
  resourceStateCodec,
  ROUTES,
} from "./navigation.ts";
import type { ResourceTarget } from "./navigation.ts";

export const bootRoute = createRoute({ component: BootScreen, id: ROUTES.boot, params: bootParamsCodec });

export const resourceRoute = createRoute({
  component: ResourceScreen,
  id: ROUTES.resource,
  params: resourceParamsCodec,
  screenState: resourceStateCodec,
});

export const describeRoute = createRoute({
  component: DescribeScreen,
  id: ROUTES.describe,
  params: describeParamsCodec,
});

/** The c9s router: a splash, then a stack of resource lists and describe views. */
export const createC9sRouter = function createC9sRouter(target?: ResourceTarget) {
  return createRouter({
    initial: { params: target === undefined ? {} : { target }, routeId: ROUTES.boot },
    routes: [bootRoute, resourceRoute, describeRoute],
  });
};
