export type DbType = "postgres" | "mysql" | "tdengine";

export type Capability =
  | "read_only"
  | "dev_write"
  | "dev_ddl"
  | "admin_tools"
  | "prod_guarded";

export interface DbProfile {
  name: string;
  type: DbType;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  user?: string;
  passwordEnv?: string;
  urlEnv?: string;
  ssl?: boolean | Record<string, unknown>;
  extensions?: string[];
  defaultLimit?: number;
  maxRows?: number;
  maxAffectedRows?: number;
  capability: Capability;
  tags?: string[];
  description?: string;
}

export interface ProjectRoute {
  match: string;
  profile: string;
  database?: string;
  schema?: string;
  description?: string;
}

export interface ResolvedContext {
  profile: DbProfile;
  database?: string;
  schema?: string;
  route?: ProjectRoute;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  profile: string;
  database?: string;
  schema?: string;
}

export interface ExecuteResult {
  command?: string;
  rowCount?: number;
  rows?: Record<string, unknown>[];
  profile: string;
  database?: string;
  schema?: string;
  dryRun?: boolean;
}
