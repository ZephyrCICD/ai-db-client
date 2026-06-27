import { spawn } from "node:child_process";
import { DbAdapter, ExecuteOptions, QueryOptions } from "./base.js";
import { ExecuteResult, QueryResult, ResolvedContext } from "../types.js";

function runTaos(context: ResolvedContext, sql: string): Promise<string> {
  const { profile } = context;
  const args = ["-h", profile.host ?? "127.0.0.1", "-P", String(profile.port ?? 6030)];
  if (profile.user) args.push("-u", profile.user);
  if (profile.passwordEnv && process.env[profile.passwordEnv]) args.push("-p", process.env[profile.passwordEnv] as string);
  if (context.database) args.push("-d", context.database);
  args.push("-s", sql);

  return new Promise((resolve, reject) => {
    const child = spawn("taos", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `taos exited with ${code}`));
    });
  });
}

function parseTaosText(context: ResolvedContext, output: string, limit?: number): QueryResult {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dataLines = lines.filter((line) => !line.startsWith("Query OK") && !line.startsWith("Database changed"));
  const rows = dataLines.map((line) => ({ line }));
  const max = limit ?? context.profile.defaultLimit ?? 100;
  return {
    columns: ["line"],
    rows: rows.slice(0, max),
    rowCount: rows.length,
    truncated: rows.length > max,
    profile: context.profile.name,
    database: context.database,
    schema: context.schema,
  };
}

export class TdengineAdapter implements DbAdapter {
  async ping(context: ResolvedContext): Promise<Record<string, unknown>> {
    const output = await runTaos(context, "select server_version();");
    return { ok: true, profile: context.profile.name, type: "tdengine", output };
  }

  async query(context: ResolvedContext, options: QueryOptions): Promise<QueryResult> {
    const output = await runTaos(context, options.sql);
    return parseTaosText(context, output, options.limit);
  }

  async execute(context: ResolvedContext, options: ExecuteOptions): Promise<ExecuteResult> {
    if (options.dryRun) {
      return { profile: context.profile.name, database: context.database, schema: context.schema, dryRun: true };
    }
    const output = await runTaos(context, options.sql);
    return {
      command: "taos",
      rowCount: undefined,
      rows: [{ output }],
      profile: context.profile.name,
      database: context.database,
      schema: context.schema,
    };
  }

  async listTables(context: ResolvedContext): Promise<QueryResult> {
    return this.query(context, { sql: "show tables;", limit: context.profile.maxRows });
  }

  async tableSchema(context: ResolvedContext, table: string): Promise<QueryResult> {
    return this.query(context, { sql: `describe ${table};`, limit: context.profile.maxRows });
  }
}
