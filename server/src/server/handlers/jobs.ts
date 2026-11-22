import { randomUUID } from "node:crypto";
import { API } from "../../contracts/api.ts";
import type { GeoPoint, Job, JobStatus, Scenario } from "../../contracts/types.ts";
import { nowIso } from "../../db/time.ts";
import type { JobFilter } from "../../repos/index.ts";
import { readJsonBody } from "../body.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import { queryEnum, queryInt, queryIso, queryStr } from "../query.ts";
import type { Router } from "../router.ts";
import {
  asObject,
  enumOf,
  isoStr,
  nullableStr,
  num,
  str,
  strArray,
} from "../validate.ts";

const SCENARIOS: readonly Scenario[] = ["broiler", "layer"];
const JOB_STATUSES: readonly JobStatus[] = [
  "created",
  "dispatched",
  "running",
  "paused",
  "completed",
  "cancelled",
];

function parseGeo(value: unknown): GeoPoint | null {
  if (value === null || value === undefined) return null;
  const geo = asObject(value, "location.geo");
  return {
    lat: num(geo, "lat"),
    lng: num(geo, "lng"),
    accuracy_m: num(geo, "accuracy_m"),
    source: enumOf(geo, "source", ["ipad_gps", "manual"] as const),
    captured_at: isoStr(geo, "captured_at"),
  };
}

function buildJob(value: unknown): Job {
  const input = asObject(value);
  const farmId = str(input, "farm_id");
  const houseId = str(input, "house_id");
  const location = asObject(input.location, "location");

  return {
    job_id: input.job_id === undefined ? randomUUID() : str(input, "job_id"),
    farm_id: farmId,
    house_id: houseId,
    scenario: enumOf(input, "scenario", SCENARIOS),
    batch_id: str(input, "batch_id"),
    owner_name: str(input, "owner_name"),
    location: {
      farm_id: str(location, "farm_id"),
      farm_name: str(location, "farm_name"),
      house_id: str(location, "house_id"),
      house_name: str(location, "house_name"),
      geo: parseGeo(location.geo),
    },
    attachment_ids: strArray(input, "attachment_ids"),
    status: input.status === undefined ? "created" : enumOf(input, "status", JOB_STATUSES),
    remark: nullableStr(input, "remark"),
    created_at: input.created_at === undefined ? nowIso() : isoStr(input, "created_at"),
  };
}

export function registerJobRoutes(router: Router): void {
  router.add("GET", API.jobs, (ctx) => {
    const filter: JobFilter = {
      farm_id: queryStr(ctx.url, "farm_id"),
      house_id: queryStr(ctx.url, "house_id"),
      batch_id: queryStr(ctx.url, "batch_id"),
      scenario: queryEnum(ctx.url, "scenario", SCENARIOS),
      status: queryEnum(ctx.url, "status", JOB_STATUSES),
      created_from: queryIso(ctx.url, "created_from"),
      created_to: queryIso(ctx.url, "created_to"),
      page: queryInt(ctx.url, "page", { min: 1 }),
      page_size: queryInt(ctx.url, "page_size", { min: 1, max: 200 }),
    };
    return { status: 200, data: ctx.repos.jobs.list(filter) };
  });

  router.add("POST", API.jobs, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "jobs.create", requestFingerprint(body.raw), () => {
      const job = buildJob(body.value);
      return { status: 201, data: ctx.repos.jobs.create(job) };
    });
  });

  router.add("GET", API.job(":id"), (ctx) => {
    const jobId = ctx.params.id as string;
    const job = ctx.repos.jobs.get(jobId);
    if (!job) throw new HttpError("NOT_FOUND", `任务不存在：${jobId}`);
    return { status: 200, data: job };
  });

  router.add("POST", API.jobAttachments(":id"), async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "jobs.attachment", requestFingerprint(body.raw), () => {
      const input = asObject(body.value);
      const fileId = str(input, "file_id");
      return {
        status: 200,
        data: ctx.repos.jobs.addAttachment(ctx.params.id as string, fileId),
      };
    });
  });
}