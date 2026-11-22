import { mockCommand, mockDeviceStatus, mockEvent, mockJob, mockSession, mockUpload } from "../contracts/mock.ts";
import { withTransaction } from "../db/transaction.ts";
import type { Repositories } from "../repos/index.ts";

export const DEMO_IDS = {
  device: mockDeviceStatus.device_id,
  job: mockJob.job_id,
  session: mockSession.session_id,
  event: mockEvent.event_id,
  command: mockCommand.command_id,
  upload: mockUpload.file_id,
} as const;

/** 用 T02 契约样例填一份可重复执行的演示数据；重复执行会先清掉同一批 ID。 */
export function seedDemo(repos: Repositories): void {
  const db = repos.devices.db;

  withTransaction(db, () => {
    db.prepare("DELETE FROM upload WHERE file_id = ?").run(DEMO_IDS.upload);
    db.prepare("DELETE FROM command WHERE command_id = ?").run(DEMO_IDS.command);
    db.prepare("DELETE FROM event WHERE event_id = ?").run(DEMO_IDS.event);
    db.prepare("DELETE FROM session WHERE session_id = ?").run(DEMO_IDS.session);
    db.prepare("DELETE FROM job WHERE job_id = ?").run(DEMO_IDS.job);
  });

  repos.devices.upsertStatus(mockDeviceStatus);
  repos.jobs.create(mockJob);
  repos.sessions.create(mockSession);
  repos.events.insert(mockEvent);
  repos.commands.create(mockCommand);
  repos.uploads.create(mockUpload);
}