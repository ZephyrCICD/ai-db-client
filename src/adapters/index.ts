import { DbAdapter } from "./base.js";
import { MySqlAdapter } from "./mysql.js";
import { PostgresAdapter } from "./postgres.js";
import { TdengineAdapter } from "./tdengine.js";
import { DbType } from "../types.js";

const adapters: Record<DbType, DbAdapter> = {
  postgres: new PostgresAdapter(),
  mysql: new MySqlAdapter(),
  tdengine: new TdengineAdapter(),
};

export function getAdapter(type: DbType): DbAdapter {
  return adapters[type];
}
