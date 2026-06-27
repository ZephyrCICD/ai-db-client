import { spawn } from "node:child_process";
function runTaos(context, sql) {
    const { profile } = context;
    const args = ["-h", profile.host ?? "127.0.0.1", "-P", String(profile.port ?? 6030)];
    if (profile.user)
        args.push("-u", profile.user);
    if (profile.passwordEnv && process.env[profile.passwordEnv])
        args.push("-p", process.env[profile.passwordEnv]);
    if (context.database)
        args.push("-d", context.database);
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
            if (code === 0)
                resolve(stdout);
            else
                reject(new Error(stderr || `taos exited with ${code}`));
        });
    });
}
function parseTaosText(context, output, limit) {
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
export class TdengineAdapter {
    async ping(context) {
        const output = await runTaos(context, "select server_version();");
        return { ok: true, profile: context.profile.name, type: "tdengine", output };
    }
    async query(context, options) {
        const output = await runTaos(context, options.sql);
        return parseTaosText(context, output, options.limit);
    }
    async execute(context, options) {
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
    async listTables(context) {
        return this.query(context, { sql: "show tables;", limit: context.profile.maxRows });
    }
    async tableSchema(context, table) {
        return this.query(context, { sql: `describe ${table};`, limit: context.profile.maxRows });
    }
}
