import { API } from "../contracts/api";
import type { Command, Job, Page, Scenario, Session } from "../contracts/types";
import { request } from "./client";

export interface CreateJobPayload {
  farm_id: string;
  house_id: string;
  scenario: Scenario;
  batch_id: string;
  owner_name: string;
  location: {
    farm_id: string;
    farm_name: string;
    house_id: string;
    house_name: string;
    geo: {
      lat: number;
      lng: number;
      accuracy_m: number;
      source: "manual";
      captured_at: string;
    } | null;
  };
  attachment_ids: string[];
  status: Job["status"];
  remark: string | null;
}

export interface JobHistoryData {
  jobs: Page<Job>;
  sessions: Page<Session>;
}

const HISTORY_PAGE_SIZE = 200;

export function fetchJobHistory(signal?: AbortSignal): Promise<JobHistoryData> {
  return Promise.all([
    request<Page<Job>>(`${API.jobs}?page_size=${HISTORY_PAGE_SIZE}`, { signal }),
    request<Page<Session>>(`${API.sessions}?page_size=${HISTORY_PAGE_SIZE}`, { signal }),
  ]).then(([jobs, sessions]) => ({ jobs, sessions }));
}

export function createJob(payload: CreateJobPayload): Promise<Job> {
  return request<Job>(API.jobs, { json: payload });
}

export function dispatchStartJob(
  deviceId: string,
  expectedStateVersion: number,
): Promise<Command> {
  return request<Command>(API.commands, {
    json: {
      device_id: deviceId,
      action: "start_job",
      expected_state_version: expectedStateVersion,
    },
  });
}