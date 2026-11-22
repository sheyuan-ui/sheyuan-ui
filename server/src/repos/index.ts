import type { Db } from "../db/open.ts";
import { AuditRepository } from "./audit.ts";
import { CommandRepository } from "./commands.ts";
import { DeviceRepository } from "./devices.ts";
import { EventRepository } from "./events.ts";
import { IdempotencyRepository } from "./idempotency.ts";
import { JobRepository } from "./jobs.ts";
import { SessionRepository } from "./sessions.ts";
import { UploadRepository } from "./uploads.ts";

export { AuditRepository, type ActorRole, type AuditEntry, type AuditInput } from "./audit.ts";
export { CommandRepository } from "./commands.ts";
export {
  DeviceRepository,
  type DeviceRecord,
  type PairCodeResult,
  type PairStatus,
} from "./devices.ts";
export { EventRepository } from "./events.ts";
export { IdempotencyRepository, type IdempotencyReservation } from "./idempotency.ts";
export { JobRepository, type JobFilter } from "./jobs.ts";
export {
  SessionRepository,
  type ScoreChangeReason,
  type ScoreVersion,
  type SessionFilter,
} from "./sessions.ts";
export { UploadRepository } from "./uploads.ts";

export interface Repositories {
  devices: DeviceRepository;
  jobs: JobRepository;
  sessions: SessionRepository;
  events: EventRepository;
  commands: CommandRepository;
  uploads: UploadRepository;
  idempotency: IdempotencyRepository;
  audit: AuditRepository;
}

export function createRepositories(db: Db): Repositories {
  return {
    devices: new DeviceRepository(db),
    jobs: new JobRepository(db),
    sessions: new SessionRepository(db),
    events: new EventRepository(db),
    commands: new CommandRepository(db),
    uploads: new UploadRepository(db),
    idempotency: new IdempotencyRepository(db),
    audit: new AuditRepository(db),
  };
}