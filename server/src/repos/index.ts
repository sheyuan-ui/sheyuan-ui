import type { Db } from "../db/open.ts";
import { AuditRepository } from "./audit.ts";
import { CommandRepository } from "./commands.ts";
import { DeviceRepository } from "./devices.ts";
import { EventRepository } from "./events.ts";
import { IdempotencyRepository } from "./idempotency.ts";
import { JobRepository } from "./jobs.ts";
import { RefreshTokenRepository } from "./refresh-tokens.ts";
import { SessionRepository } from "./sessions.ts";
import { UploadRepository } from "./uploads.ts";
import { UserRepository } from "./users.ts";

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
export {
  RefreshTokenRepository,
  type RefreshTokenRecord,
  type RevokeReason,
} from "./refresh-tokens.ts";
export { UserRepository, type UserRecord, type UserStatus, type CreateUserInput } from "./users.ts";

export interface Repositories {
  devices: DeviceRepository;
  jobs: JobRepository;
  sessions: SessionRepository;
  events: EventRepository;
  commands: CommandRepository;
  uploads: UploadRepository;
  idempotency: IdempotencyRepository;
  audit: AuditRepository;
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
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
    users: new UserRepository(db),
    refreshTokens: new RefreshTokenRepository(db),
  };
}