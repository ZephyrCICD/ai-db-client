import mysql from "mysql2/promise";
import { DbAdapter, ExecuteOptions, QueryOptions } from "./base.js";
import { ExecuteResult, QueryResult, ResolvedContext } from "../types.js";

async function connection(context: ResolvedContext): Promise<mysql.Connection> {
  const { profile } = context;
  const uri = profile.urlEnv ? process.env[profile.urlEnv] : undefined;
  if (uri) return mysql.createConnection(uri);
  return mysql.createConnection({
    host: profile.host,
    port: profile.port,
    database: context.database,
    user: profile.user,
    password: profile.passwordEnv ? process.env[profile.passwordEnv] : undefined,
    ssl: profile.ssl === true ? {} : (profile.ssl as mysql.SslOptions | undefined),
  });
}

function toRows(rows: unknown): Record<string, unknown>[] {
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function toQueryResult(context: ResolvedContext, rows: unknown, fields: mysql.FieldPacket[] | undefined, limit?: number): QueryResult {
  const records = toRows(rows);
  const max = limit ?? context.profile.defaultLimit ?? 100;
  return {
    columns: fields?.map((field) => field.name) ?? Object.keys(records[0] ?? {}),
    rows: records.slice(0, max),
    rowCount: records.length,
    truncated: records.length > max,
    profile: context.profile.name,
    database: context.database,
    schema: context.schema,
  };
}

export class MySqlAdapter implements DbAdapter {
  async ping(context: ResolvedContext): Promise<Record<string, unknown>> {
    const conn = await connection(context);
    try {
      const [rows] = await conn.query("select database() as database, version() as version");
      return { ok: true, profile: context.profile.name, type: "mysql", ...(toRows(rows)[0] ?? {}) };
    } finally {
      await conn.end();
    }
  }

  async query(context: ResolvedContext, options: QueryOptions): Promise<QueryResult> {
    const conn = await connection(context);
    try {
      const [rows, fields] = await conn.query(options.sql, options.params);
      return toQueryResult(context, rows, fields as mysql.FieldPacket[], options.limit);
    } finally {
      await conn.end();
    }
  }

  async execute(context: ResolvedContext, options: ExecuteOptions): Promise<ExecuteResult> {
    if (options.dryRun) {
      return { profile: context.profile.name, database: context.database, schema: context.schema, dryRun: true };
    }
    const conn = await connection(context);
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(options.sql, options.params);
      await conn.commit();
      const header = result as mysql.ResultSetHeader;
      return {
        command: "execute",
        rowCount: header.affectedRows,
        profile: context.profile.name,
        database: context.database,
        schema: context.schema,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.end();
    }
  }

  async listTables(context: ResolvedContext): Promise<QueryResult> {
    return this.query(context, {
      sql: "select table_schema, table_name, table_type from information_schema.tables where table_schema = coalesce(?, database()) order by table_schema, table_name",
      params: [context.database],
      limit: context.profile.maxRows,
    });
  }

  async tableSchema(context: ResolvedContext, table: string): Promise<QueryResult> {
    return this.query(context, {
      sql: "select table_schema, table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = coalesce(?, database()) and table_name = ? order by ordinal_position",
      params: [context.database, table],
      limit: context.profile.maxRows,
    });
  }

  async explain(context: ResolvedContext, sql: string): Promise<QueryResult> {
    return this.query(context, { sql: `explain ${sql}`, limit: context.profile.maxRows });
  }
}
