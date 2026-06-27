import mysql from "mysql2/promise";
async function connection(context) {
    const { profile } = context;
    const uri = profile.urlEnv ? process.env[profile.urlEnv] : undefined;
    if (uri)
        return mysql.createConnection(uri);
    return mysql.createConnection({
        host: profile.host,
        port: profile.port,
        database: context.database,
        user: profile.user,
        password: profile.passwordEnv ? process.env[profile.passwordEnv] : undefined,
        ssl: profile.ssl === true ? {} : profile.ssl,
    });
}
function toRows(rows) {
    return Array.isArray(rows) ? rows : [];
}
function toQueryResult(context, rows, fields, limit) {
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
export class MySqlAdapter {
    async ping(context) {
        const conn = await connection(context);
        try {
            const [rows] = await conn.query("select database() as database, version() as version");
            return { ok: true, profile: context.profile.name, type: "mysql", ...(toRows(rows)[0] ?? {}) };
        }
        finally {
            await conn.end();
        }
    }
    async query(context, options) {
        const conn = await connection(context);
        try {
            const [rows, fields] = await conn.query(options.sql, options.params);
            return toQueryResult(context, rows, fields, options.limit);
        }
        finally {
            await conn.end();
        }
    }
    async execute(context, options) {
        if (options.dryRun) {
            return { profile: context.profile.name, database: context.database, schema: context.schema, dryRun: true };
        }
        const conn = await connection(context);
        try {
            await conn.beginTransaction();
            const [result] = await conn.query(options.sql, options.params);
            await conn.commit();
            const header = result;
            return {
                command: "execute",
                rowCount: header.affectedRows,
                profile: context.profile.name,
                database: context.database,
                schema: context.schema,
            };
        }
        catch (error) {
            await conn.rollback();
            throw error;
        }
        finally {
            await conn.end();
        }
    }
    async listTables(context) {
        return this.query(context, {
            sql: "select table_schema, table_name, table_type from information_schema.tables where table_schema = coalesce(?, database()) order by table_schema, table_name",
            params: [context.database],
            limit: context.profile.maxRows,
        });
    }
    async tableSchema(context, table) {
        return this.query(context, {
            sql: "select table_schema, table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = coalesce(?, database()) and table_name = ? order by ordinal_position",
            params: [context.database, table],
            limit: context.profile.maxRows,
        });
    }
    async explain(context, sql) {
        return this.query(context, { sql: `explain ${sql}`, limit: context.profile.maxRows });
    }
}
