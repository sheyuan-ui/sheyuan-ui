import type { Router } from "../router.ts";
import { registerAuthRoutes } from "./auth.ts";
import { registerCommandRoutes } from "./commands.ts";
import { registerDeviceRoutes } from "./devices.ts";
import { registerDeviceCodeRoutes } from "./device-codes.ts";
import { registerEvaluationRoutes } from "./evaluations.ts";
import { registerEventRoutes } from "./events.ts";
import { registerJobRoutes } from "./jobs.ts";
import { registerSessionRoutes } from "./sessions.ts";
import { registerUploadRoutes } from "./uploads.ts";

export function registerAllRoutes(router: Router): void {
  registerAuthRoutes(router);
  registerDeviceRoutes(router);
  registerDeviceCodeRoutes(router);
  registerJobRoutes(router);
  registerSessionRoutes(router);
  registerEvaluationRoutes(router);
  registerEventRoutes(router);
  registerCommandRoutes(router);
  registerUploadRoutes(router);
}