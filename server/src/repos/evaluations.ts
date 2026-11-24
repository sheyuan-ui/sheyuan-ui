import type {
  EvaluationReport,
  EvaluationReportInput,
  EvaluationScoreStatus,
  OperationResult,
  RuleResult,
  Scenario,
  SessionScore,
} from "../contracts/types.ts";
import type { Db } from "../db/open.ts";
import { NotFoundError } from "../db/errors.ts";
import { nowIso } from "../db/time.ts";
import { withTransaction } from "../db/transaction.ts";
import type { ScoreChangeReason, SessionRepository } from "./sessions.ts";

interface ReportRow {
  score_version: number;
  external_task_id: string;
  scene: Scenario;
  total_score: number | null;
  score_status: EvaluationScoreStatus;
  received_at: string;
}

interface OperationRow {
  position: number;
  operation_id: string;
  start_time_seconds: number;
  end_time_seconds: number | null;
  score: number | null;
}

interface RuleRow {
  operation_position: number;
  rule_id: string;
  rule_name: string;
  result: RuleResult["result"];
  violation_time_seconds: number | null;
  score: number | null;
  deducted_points: number | null;
  reason: string;
}

/** 算法侧报告状态映射到会话评分状态：运行中仍是暂评，结束后才是本次评分 */
function mapSessionStatus(
  reportStatus: EvaluationScoreStatus,
  status: string,
): SessionScore["status"] {
  if (reportStatus !== "scored") return "unavailable";
  return status === "active" ? "provisional" : "final";
}

export class EvaluationRepository {
  readonly db: Db;
  private readonly sessions: SessionRepository;

  constructor(db: Db, sessions: SessionRepository) {
    this.db = db;
    this.sessions = sessions;
  }

  /** 默认取最新版本；指定版本不存在返回 null。 */
  get(sessionId: string, scoreVersion?: number): EvaluationReport | null {
    const version = scoreVersion ?? this.latestVersion(sessionId);
    if (version === null) return null;

    const report = this.db
      .prepare("SELECT * FROM evaluation_report WHERE session_id = ? AND score_version = ?")
      .get(sessionId, version) as unknown as ReportRow | undefined;
    if (!report) return null;

    const operationRows = this.db
      .prepare(
        `SELECT position, operation_id, start_time_seconds, end_time_seconds, score
         FROM operation_result
         WHERE session_id = ? AND score_version = ?
         ORDER BY position`,
      )
      .all(sessionId, version) as unknown as OperationRow[];

    const ruleRows = this.db
      .prepare(
        `SELECT operation_position, rule_id, rule_name, result,
                violation_time_seconds, score, deducted_points, reason
         FROM rule_result
         WHERE session_id = ? AND score_version = ?
         ORDER BY operation_position, position`,
      )
      .all(sessionId, version) as unknown as RuleRow[];

    const rulesByOperation = new Map<number, RuleResult[]>();
    for (const row of ruleRows) {
      const list = rulesByOperation.get(row.operation_position) ?? [];
      list.push({
        rule_id: row.rule_id,
        rule_name: row.rule_name,
        result: row.result,
        violation_time_seconds: row.violation_time_seconds,
        score: row.score,
        deducted_points: row.deducted_points,
        reason: row.reason,
      });
      rulesByOperation.set(row.operation_position, list);
    }

    const operations: OperationResult[] = operationRows.map((row) => ({
      operation_id: row.operation_id,
      start_time_seconds: row.start_time_seconds,
      end_time_seconds: row.end_time_seconds,
      score: row.score,
      rule_results: rulesByOperation.get(row.position) ?? [],
    }));

    return {
      task_id: report.external_task_id,
      scene: report.scene,
      total_score: report.total_score,
      score_status: report.score_status,
      operations,
      score_version: report.score_version,
      received_at: report.received_at,
    };
  }

  latestVersion(sessionId: string): number | null {
    const row = this.db
      .prepare("SELECT MAX(score_version) AS version FROM evaluation_report WHERE session_id = ?")
      .get(sessionId) as unknown as { version: number | null } | undefined;
    return row?.version ?? null;
  }

  /**
   * 追加一版报告，并在同一事务里同步会话评分。
   * 版本取会话评分与已有报告版本的较大者加一，避免人工改分后导入被陈旧版本拒绝。
   */
  append(sessionId: string, input: EvaluationReportInput): EvaluationReport {
    return withTransaction(this.db, () => {
      const session = this.sessions.get(sessionId);
      if (!session) throw new NotFoundError("会话", sessionId);

      const latest = this.latestVersion(sessionId);
      const hasReport = latest !== null;
      const scoreVersion = Math.max(session.score.score_version, latest ?? 0) + 1;
      const receivedAt = nowIso();
      const status = mapSessionStatus(input.score_status, session.status);

      this.db
        .prepare(
          `INSERT INTO evaluation_report (
             session_id, score_version, external_task_id, scene,
             total_score, score_status, received_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sessionId,
          scoreVersion,
          input.task_id,
          input.scene,
          input.total_score,
          input.score_status,
          receivedAt,
        );

      const insertOperation = this.db.prepare(
        `INSERT INTO operation_result (
           session_id, score_version, position, operation_id,
           start_time_seconds, end_time_seconds, score
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertRule = this.db.prepare(
        `INSERT INTO rule_result (
           session_id, score_version, operation_position, position,
           rule_id, rule_name, result, violation_time_seconds,
           score, deducted_points, reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      input.operations.forEach((operation, operationIndex) => {
        insertOperation.run(
          sessionId,
          scoreVersion,
          operationIndex,
          operation.operation_id,
          operation.start_time_seconds,
          operation.end_time_seconds,
          operation.score,
        );
        operation.rule_results.forEach((rule, ruleIndex) => {
          insertRule.run(
            sessionId,
            scoreVersion,
            operationIndex,
            ruleIndex,
            rule.rule_id,
            rule.rule_name,
            rule.result,
            rule.violation_time_seconds,
            rule.score,
            rule.deducted_points,
            rule.reason,
          );
        });
      });

      const reason: ScoreChangeReason = hasReport
        ? "reanalysis"
        : status === "provisional"
          ? "provisional"
          : "final";
      this.sessions.saveScore(
        sessionId,
        {
          ...session.score,
          status,
          value: input.total_score,
          score_version: scoreVersion,
        },
        reason,
        receivedAt,
      );

      const stored = this.get(sessionId, scoreVersion);
      if (!stored) throw new NotFoundError("评估报告", sessionId);
      return stored;
    });
  }
}
