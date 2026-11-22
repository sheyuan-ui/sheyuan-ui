import type { Db } from "./open.ts";

const depthByDb = new WeakMap<Db, number>();

/** 外层用 BEGIN IMMEDIATE，嵌套用 SAVEPOINT，保证写事务串行且可局部回滚。 */
export function withTransaction<T>(db: Db, fn: () => T): T {
  const depth = depthByDb.get(db) ?? 0;
  const savepoint = depth === 0 ? null : `sp_${depth}`;

  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
  depthByDb.set(db, depth + 1);

  try {
    const result = fn();
    db.exec(savepoint ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (error) {
    if (savepoint) {
      db.exec(`ROLLBACK TO ${savepoint}`);
      db.exec(`RELEASE ${savepoint}`);
    } else {
      db.exec("ROLLBACK");
    }
    throw error;
  } finally {
    depthByDb.set(db, depth);
  }
}