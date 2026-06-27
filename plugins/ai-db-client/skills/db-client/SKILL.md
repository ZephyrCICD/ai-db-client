---
name: db-client
description: Use AI DB Client when a user asks an AI agent to inspect, query, seed, update, or administer configured PostgreSQL, TimescaleDB, MySQL, or TDengine databases through profiles and project routing. Use for database schema exploration, safe writes, mock data initialization, profile suggestions from conversation context, and deciding when to call db_query, db_execute, or db_suggest_profile.
---

# AI DB Client

Use the `ai-db-client` MCP tools for database work when profiles are available or when the user wants to turn repeated connection details into a reusable profile.

## Core Rules

- Use `db_resolve_context` first when a project path may map to a default profile.
- Use `db_query` for read-only SQL.
- Use `db_execute` for `INSERT`, `UPDATE`, `DELETE`, DDL, and mock-data setup.
- Use `db_seed` for multi-statement mock data or fixture initialization.
- Use `dryRun: true` before risky or broad changes.
- Never write to a `prod_guarded` or unknown profile unless the user explicitly authorizes a separate high-trust workflow.
- Never run `UPDATE` or `DELETE` without a `WHERE` clause.
- Prefer `db_seed` for repeatable mock-data initialization; keep statements idempotent.
- For PostgreSQL profiles with `extensions: [timescaledb]`, treat TimescaleDB as PostgreSQL plus extension-specific introspection.
- For dump/import/export tasks, prefer official CLI tools through plugin capabilities when available: `pg_dump`, `pg_restore`, `mysqldump`, `mysql`, `taosdump`, and `taos`.

## Profile Evolution

When the conversation repeatedly mentions database connection details, do not silently save them.

1. Summarize the repeated connection details.
2. Call `db_suggest_profile` with the relevant text.
3. Show the redacted profile suggestion to the user.
4. Ask whether to add it to their local profile config.
5. Only write profile config if the user explicitly confirms and provides a safe credential reference such as an environment variable name.

Profiles must not contain raw passwords, access tokens, private keys, or production credentials.

## Safety Checklist Before Writes

- Confirm the resolved profile name, database, and schema.
- Confirm the profile capability allows the write.
- Check whether the SQL is idempotent or reversible.
- Use transactions where the adapter supports them.
- Keep the affected row set bounded.
- Report the audit log location after a successful write when useful.

## Typical Flow

1. `db_resolve_context` with the current project path.
2. `db_ping` to confirm connectivity.
3. `db_list_tables` or `db_table_schema` to inspect shape.
4. `db_query` to verify current data.
5. `db_execute` with `dryRun: true` for proposed changes.
6. `db_seed` for mock data initialization when multiple statements are needed.
7. `db_execute` or `db_seed` without dry run only after the user intent and target are clear.
