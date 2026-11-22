import type { Router } from "../router.ts";
import { registerCommandRoutes } from "./commands.ts";
import { registerDeviceRoutes } from "./devices.ts";
import { registerEventRoutes } from "./events.ts";
import { registerJobRoutes } from "./jobs.ts";
import { registerSessionRoutes } from "./sessions.ts";
import { registerUploadRoutes } from "./uploads.ts";

export function registerAllRoutes(router: Router): void {
  registerDeviceRoutes(router);
  registerJobRoutes(router);
  registerSessionRoutes(router);
  registerEventRoutes(router);
  registerCommandRoutes(router);
  registerUploadRoutes(router);
}