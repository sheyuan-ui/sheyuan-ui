-- T04 认证与授权：账号、刷新令牌
-- 只增不改：0001 / 0002 已发布的校验和保持不变。
-- 角色枚举与 audit_log.actor_role 一致：viewer / operator / admin

CREATE TABLE app_user (
  user_id       TEXT PRIMARY KEY,
  -- 账号不区分大小写登录，唯一性同样不区分
  username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name  TEXT NOT NULL,
  -- scrypt$N$r$p$salt$hash，算法参数随哈希一起存，升级算力时无需改表
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('viewer', 'operator', 'admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX idx_app_user_role ON app_user (role);

-- 刷新令牌只存 SHA-256 哈希；轮换时旧令牌置 revoked_at 并指向 replaced_by。
-- 一次会话一条记录，注销、轮换、复用检测都靠 revoked_reason 留痕。
CREATE TABLE auth_refresh_token (
  token_id       TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  issued_at      TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  revoked_at     TEXT,
  revoked_reason TEXT CHECK (
                   revoked_reason IS NULL
                   OR revoked_reason IN ('logout', 'rotated', 'reuse_detected', 'disabled')
                 ),
  replaced_by    TEXT,
  client         TEXT,

  CHECK (expires_at > issued_at),
  -- 吊销时间与原因必须同时有或同时无
  CHECK (
    (revoked_at IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
  )
);

CREATE INDEX idx_refresh_user ON auth_refresh_token (user_id);
CREATE INDEX idx_refresh_expires ON auth_refresh_token (expires_at);
