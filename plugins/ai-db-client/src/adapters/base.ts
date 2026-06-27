import { ExecuteResult, QueryResult, ResolvedContext } from "../types.js";

export interface QueryOptions {
  sql: string;
  params?: unknown[];
  limit?: number;
}

export interface ExecuteOptions {
  sql: string;
  params?: unknown[];
  confirmed?: boolean;
  dryRun?: boolean;
}

export interface DbAdapter {
  ping(context: ResolvedContext): Promise<Record<string, unknown>>;
  query(context: ResolvedContext, options: QueryOptions): Promise<QueryResult>;
  execute(context: ResolvedContext, options: ExecuteOptions): Promise<ExecuteResult>;
  listTables(context: ResolvedContext): Promise<QueryResult>;
  tableSchema(context: ResolvedContext, table: string): Promise<QueryResult>;
  explain?(context: ResolvedContext, sql: string): Promise<QueryResult>;
}
