export class DbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DbError {
  readonly entity: string;
  readonly id: string;

  constructor(entity: string, id: string) {
    super(`${entity} 不存在：${id}`);
    this.entity = entity;
    this.id = id;
  }
}

/** 主键/唯一约束冲突，对应 HTTP 409 */
export class ConflictError extends DbError {}

/** 乐观锁不匹配，对应 HTTP 409（state_version） */
export class StaleVersionError extends DbError {}

/** 业务前置条件不成立，对应 HTTP 400/422 */
export class ValidationError extends DbError {}