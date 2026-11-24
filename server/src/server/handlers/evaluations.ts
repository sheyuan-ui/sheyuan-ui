import type {
  EvaluationReportInput,
  EvaluationScoreStatus,
  OperationResult,
  RuleResult,
  RuleResultOutcome,
  Scenario,
} from "../../contracts/types.ts";
import { withTransaction } from "../../db/transaction.ts";
import { readJsonBody } from "../body.ts";
import { HttpError } from "../http-errors.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import { queryInt } from "../query.ts";
import type { Router } from "../router.ts";
import { asObject, enumOf, nullableNum, num, objArray, str } from "../validate.ts";

/**
 * 评估报告接口路径。
 * 暂放本地：`contracts/api.ts` 是上游只读副本，等 T02 合并后再上提。
 */
export const EVALUATION_API = {
  sessionEvaluation: "/api/sessions/:id/evaluation",
} as const;

const SCENES: readonly Scenario[] = ["broiler", "layer"];
const SCORE_STATUSES: readonly EvaluationScoreStatus[] = [
  "scoring_not_defined",
  "insufficient_data",
  "scored",
];
const RULE_OUTCOMES: readonly RuleResultOutcome[] = [
  "compliant",
  "noncompliant",
  "unknown",
  "not_applicable",
];

function nonNegative(value: number, field: string): number {
  if (value < 0) throw new HttpError("INVALID_ARGUMENT", `${field} 不能小于 0`);
  return value;
}

function parseRuleResult(
  input: Record<string, unknown>,
  field: string,
  startSeconds: number,
  endSeconds: number | null,
): RuleResult {
  const violation = nullableNum(input, "violation_time_seconds", { min: 0 });
  if (
    violation !== null &&
    (violation < startSeconds || (endSeconds !== null && violation > endSeconds))
  ) {
    throw new HttpError("INVALID_ARGUMENT", `${field}.violation_time_seconds 必须落在操作区间内`);
  }

  return {
    rule_id: str(input, "rule_id"),
    rule_name: str(input, "rule_name"),
    result: enumOf(input, "result", RULE_OUTCOMES),
    violation_time_seconds: violation,
    score: nullableNum(input, "score", { min: 0, max: 100 }),
    deducted_points: nullableNum(input, "deducted_points", { min: 0 }),
    reason: str(input, "reason", { allowEmpty: true }),
  };
}

function parseOperation(value: unknown, index: number): OperationResult {
  const field = `operations[${index}]`;
  const input = asObject(value, field);
  const startSeconds = nonNegative(num(input, "start_time_seconds"), `${field}.start_time_seconds`);
  const endSeconds = nullableNum(input, "end_time_seconds", { min: 0 });
  if (endSeconds !== null && endSeconds < startSeconds) {
    throw new HttpError("INVALID_ARGUMENT", `${field}.end_time_seconds 不能早于开始时间`);
  }

  return {
    operation_id: str(input, "operation_id"),
    start_time_seconds: startSeconds,
    end_time_seconds: endSeconds,
    score: nullableNum(input, "score", { min: 0, max: 100 }),
    rule_results: objArray(input, "rule_results").map((rule, ruleIndex) =>
      parseRuleResult(rule, `${field}.rule_results[${ruleIndex}]`, startSeconds, endSeconds),
    ),
  };
}

/** 报文校验：task_id 必须与路径会话一致；有分状态必须给总分，反之必须为 null。 */
function parseReport(value: unknown, sessionId: string): EvaluationReportInput {
  const input = asObject(value);

  const taskId = str(input, "task_id");
  if (taskId !== sessionId) {
    throw new HttpError("INVALID_ARGUMENT", "task_id 必须与路径中的会话 ID 一致", {
      task_id: taskId,
      session_id: sessionId,
    });
  }

  const scoreStatus = enumOf(input, "score_status", SCORE_STATUSES);
  const totalScore = nullableNum(input, "total_score", { min: 0, max: 100 });
  if ((scoreStatus === "scored") !== (totalScore !== null)) {
    throw new HttpError(
      "INVALID_ARGUMENT",
      "score_status=scored 时 total_score 必须给出，其余状态必须为 null",
    );
  }

  const operations = objArray(input, "operations").map(parseOperation);
  const operationIds = new Set<string>();
  for (const operation of operations) {
    if (operationIds.has(operation.operation_id)) {
      throw new HttpError("INVALID_ARGUMENT", `operation_id 重复：${operation.operation_id}`);
    }
    operationIds.add(operation.operation_id);
  }

  return {
    task_id: taskId,
    scene: enumOf(input, "scene", SCENES),
    total_score: totalScore,
    score_status: scoreStatus,
    operations,
  };
}

export function registerEvaluationRoutes(router: Router): void {
  router.add("GET", EVALUATION_API.sessionEvaluation, (ctx) => {
    const sessionId = ctx.params.id as string;
    if (!ctx.repos.sessions.get(sessionId)) {
      throw new HttpError("NOT_FOUND", `会话不存在：${sessionId}`);
    }

    const version = queryInt(ctx.url, "version", { min: 1 });
    const report = ctx.repos.evaluations.get(sessionId, version);
    if (!report) {
      throw new HttpError(
        "NOT_FOUND",
        version === undefined
          ? `会话尚无评估报告：${sessionId}`
          : `评估报告版本不存在：${sessionId} v${version}`,
      );
    }
    return { status: 200, data: report };
  });

  router.add("PUT", EVALUATION_API.sessionEvaluation, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "evaluations.import", requestFingerprint(body.raw), () => {
      const sessionId = ctx.params.id as string;
      const input = parseReport(body.value, sessionId);

      const session = ctx.repos.sessions.get(sessionId);
      if (!session) throw new HttpError("NOT_FOUND", `会话不存在：${sessionId}`);
      const job = ctx.repos.jobs.get(session.job_id);
      if (!job) throw new HttpError("NOT_FOUND", `任务不存在：${session.job_id}`);
      if (job.scenario !== input.scene) {
        throw new HttpError("INVALID_ARGUMENT", "scene 与任务场景不一致", {
          scene: input.scene,
          job_scenario: job.scenario,
        });
      }

      const stored = withTransaction(ctx.repos.evaluations.db, () => {
        const report = ctx.repos.evaluations.append(sessionId, input);
        ctx.repos.audit.append({
          actor_id: ctx.auth?.user_id ?? null,
          actor_role: ctx.auth?.role ?? null,
          action: "evaluation.import",
          target_type: "session",
          target_id: sessionId,
          detail: {
            score_version: report.score_version,
            score_status: report.score_status,
            operations: report.operations.length,
          },
        });
        return report;
      });

      return { status: 200, data: stored };
    });
  });
}
