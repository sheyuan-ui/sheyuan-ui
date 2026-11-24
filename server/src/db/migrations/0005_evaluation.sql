-- 算法侧评分输出：按会话（一轮作业）版本化保存
-- 只增不改：0001–0004 的建表与校验和保持不变。
-- 报文 score_status 与 session.score_status 枚举不同，原样存本表，再由访问层映射到会话评分。

CREATE TABLE evaluation_report (
  session_id       TEXT NOT NULL REFERENCES session (session_id) ON DELETE CASCADE,
  score_version    INTEGER NOT NULL CHECK (score_version >= 1),
  -- 算法侧作业编号；接口要求与 session_id 一致，单独留一列便于追溯
  external_task_id TEXT NOT NULL,
  scene            TEXT NOT NULL CHECK (scene IN ('layer', 'broiler')),
  total_score      REAL CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= 100)),
  score_status     TEXT NOT NULL
                   CHECK (score_status IN ('scoring_not_defined', 'insufficient_data', 'scored')),
  received_at      TEXT NOT NULL,
  PRIMARY KEY (session_id, score_version),
  -- 有分必须给分，无分不得给分
  CHECK ((score_status = 'scored') = (total_score IS NOT NULL))
);

CREATE TABLE operation_result (
  session_id         TEXT NOT NULL,
  score_version      INTEGER NOT NULL,
  -- 报文数组顺序，读回时按此排序
  position           INTEGER NOT NULL CHECK (position >= 0),
  operation_id       TEXT NOT NULL,
  start_time_seconds REAL NOT NULL CHECK (start_time_seconds >= 0),
  end_time_seconds   REAL
                     CHECK (end_time_seconds IS NULL OR end_time_seconds >= start_time_seconds),
  score              REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  PRIMARY KEY (session_id, score_version, position),
  UNIQUE (session_id, score_version, operation_id),
  FOREIGN KEY (session_id, score_version)
    REFERENCES evaluation_report (session_id, score_version) ON DELETE CASCADE
);

CREATE TABLE rule_result (
  session_id             TEXT NOT NULL,
  score_version          INTEGER NOT NULL,
  operation_position     INTEGER NOT NULL,
  position               INTEGER NOT NULL CHECK (position >= 0),
  rule_id                TEXT NOT NULL,
  rule_name              TEXT NOT NULL,
  result                 TEXT NOT NULL
                         CHECK (result IN ('compliant', 'noncompliant', 'unknown', 'not_applicable')),
  violation_time_seconds REAL
                         CHECK (violation_time_seconds IS NULL OR violation_time_seconds >= 0),
  score                  REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  deducted_points        REAL CHECK (deducted_points IS NULL OR deducted_points >= 0),
  reason                 TEXT NOT NULL,
  PRIMARY KEY (session_id, score_version, operation_position, position),
  FOREIGN KEY (session_id, score_version, operation_position)
    REFERENCES operation_result (session_id, score_version, position) ON DELETE CASCADE
);

-- 按规定回看：某轮作业中哪条规则被扣分
CREATE INDEX idx_rule_result_rule ON rule_result (session_id, rule_id);
