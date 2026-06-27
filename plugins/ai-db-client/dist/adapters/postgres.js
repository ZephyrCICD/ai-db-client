import pg from "pg";
function connectionConfig(context) {
    const { profile } = context;
    const connectionString = profile.urlEnv ? process.env[profile.urlEnv] : undefined;
    return {
        connectionString,
        host: connectionString ? undefined : profile.host,
        port: connectionString ? undefined : profile.port,
        database: connectionString ? undefined : context.database,
        user: connectionString ? undefined : profile.user,
        password: profile.passwordEnv ? process.env[profile.passwordEnv] : undefined,
        ssl: profile.ssl,
    };
}
async function withClient(context, fn) {
    const client = new pg.Client(connectionConfig(context));
    await client.connect();
    try {
        if (context.schema) {
            await client.query(`set search_path to ${pgEscapeIdentifier(context.schema)}`);
        }
        return await fn(client);
    }
    finally {
        await client.end();
    }
}
function pgEscapeIdentifier(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
function toQueryResult(context, result, limit) {
    const rows = result.rows;
    const max = limit ?? context.profile.defaultLimit ?? 100;
    return {
        columns: result.fields?.map((field) => field.name) ?? Object.keys(rows[0] ?? {}),
        rows: rows.slice(0, max),
        rowCount: result.rowCount ?? rows.length,
        truncated: rows.length > max,
        profile: context.profile.name,
        database: context.database,
        schema: context.schema,
    };
}
export class PostgresAdapter {
    async ping(context) {
        return withClient(context, async (client) => {
            const version = await client.query("select current_database() as database, current_schema() as schema, version() as version");
            const extensions = context.profile.extensions?.includes("timescaledb")
                ? await client.query("select extversion from pg_extension where extname = 'timescaledb'")
                : undefined;
            return {
                ok: true,
                profile: context.profile.name,
                type: "postgres",
                database: version.rows[0]?.database,
                schema: version.rows[0]?.schema,
                version: version.rows[0]?.version,
                timescaledb: extensions?.rows[0]?.extversion ?? null,
            };
        });
    }
    async query(context, options) {
        return withClient(context, async (client) => {
            const result = await client.query(options.sql, options.params);
            return toQueryResult(context, result, options.limit);
        });
    }
    async execute(context, options) {
        if (options.dryRun) {
            return { profile: context.profile.name, database: context.database, schema: context.schema, dryRun: true };
        }
        return withClient(context, async (client) => {
            await client.query("begin");
            try {
                const result = await client.query(options.sql, options.params);
                await client.query("commit");
                return {
                    command: result.command,
                    rowCount: result.rowCount ?? undefined,
                    rows: result.rows,
                    profile: context.profile.name,
                    database: context.database,
                    schema: context.schema,
                };
            }
            catch (error) {
                await client.query("rollback");
                throw error;
            }
        });
    }
    async listTables(context) {
        return this.query(context, {
            sql: "select table_schema, table_name, table_type from information_schema.tables where table_schema = coalesce($1, table_schema) order by table_schema, table_name",
            params: [context.schema],
            limit: context.profile.maxRows,
        });
    }
    async tableSchema(context, table) {
        return this.query(context, {
            sql: "select table_schema, table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = coalesce($1, table_schema) and table_name = $2 order by ordinal_position",
            params: [context.schema, table],
            limit: context.profile.maxRows,
        });
    }
    async explain(context, sql) {
        return this.query(context, { sql: `explain ${sql}`, limit: context.profile.maxRows });
    }
}
