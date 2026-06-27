# AI DB Client

AI DB Client is a local-first database plugin for AI agents. It gives Codex and Claude a profile-aware MCP server for querying and safely mutating PostgreSQL, TimescaleDB, MySQL, TDengine, and future database backends.

The plugin does not ship with personal profiles, credentials, or database endpoints. Developers configure their own local profiles after installation.

## Why This Exists

AI agents often need database context while coding: inspect schemas, verify records, initialize mock data, or update development fixtures. Raw terminal access is powerful but easy to misuse. AI DB Client adds a structured layer between the agent and the database:

- reusable local profiles
- project-to-database routing
- read/write capability levels
- safer write guards
- audit logs
- profile suggestions from repeated conversation context
- adapter-based database support

`db_check`-style read-only tools become unnecessary once this MCP is installed, because `db_query`, `db_list_tables`, and `db_table_schema` cover the same read-only use cases. If you already use `db_check`, treat AI DB Client as its replacement and keep read-only behavior by setting profiles to `read_only`.

## Supported Backends

Current scaffold:

- PostgreSQL via `pg`
- TimescaleDB as a PostgreSQL extension profile
- MySQL via `mysql2`
- TDengine via the official `taos` CLI

Planned adapter targets include SQLite, DuckDB, ClickHouse, SQL Server, MongoDB, Redis/Valkey, and InfluxDB.

## Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/zephyrcicd/ai-db-client.git
cd ai-db-client/plugins/ai-db-client
npm install
npm run build
```

### Codex Plugin

The repository includes:

```text
.codex-plugin/plugin.json
.mcp.json
skills/db-client/SKILL.md
```

Install the GitHub repository as a marketplace, then install the plugin:

```bash
codex plugin marketplace add zephyrcicd/ai-db-client
codex plugin add ai-db-client@ai-db-client
```

For local development, point the marketplace command at the repository path instead of GitHub.

### Claude Desktop

Add an MCP server entry that points to the built server:

```json
{
  "mcpServers": {
    "ai-db-client": {
      "command": "node",
      "args": ["/absolute/path/to/ai-db-client/plugins/ai-db-client/dist/index.js"],
      "env": {
        "AI_DB_CLIENT_CONFIG_DIR": "~/.config/ai-db-client",
        "AI_DB_CLIENT_STATE_DIR": "~/.local/state/ai-db-client"
      }
    }
  }
}
```

Restart Claude Desktop after changing the config.

## Configure Profiles

Create a local config directory:

```bash
mkdir -p ~/.config/ai-db-client
cp config/profiles.example.yaml ~/.config/ai-db-client/profiles.yaml
cp config/projects.example.yaml ~/.config/ai-db-client/projects.yaml
```

Edit the copied files for your own environment. Do not commit them.

Example PostgreSQL profile:

```yaml
profiles:
  app_dev:
    type: postgres
    host: 127.0.0.1
    port: 5432
    database: app_dev
    schema: public
    user: app
    passwordEnv: APP_DEV_POSTGRES_PASSWORD
    capability: dev_write
    defaultLimit: 100
    maxRows: 5000
    maxAffectedRows: 1000
```

Set the password in your shell or secret manager:

```bash
export APP_DEV_POSTGRES_PASSWORD='<set-in-your-shell>'
```

You may also place local environment variables in `~/.config/ai-db-client/.env`.
This file is never part of the plugin repository.

Example TimescaleDB profile:

```yaml
profiles:
  metrics_dev:
    type: postgres
    extensions:
      - timescaledb
    host: 127.0.0.1
    port: 5432
    database: metrics_dev
    schema: public
    user: app
    passwordEnv: METRICS_DEV_POSTGRES_PASSWORD
    capability: dev_write
```

## Project Routing

Map project paths or repository names to profiles:

```yaml
projects:
  - match: /path/to/your-app
    profile: app_dev
    database: app_dev
    schema: public
```

When an agent works inside that project, it can call `db_resolve_context` and select the correct database without asking every time.

## Capabilities

Profiles use capability levels:

| Capability | Meaning |
| --- | --- |
| `read_only` | Inspect schemas and run read-only SQL only. |
| `dev_write` | Allow bounded writes in development/test databases. |
| `dev_ddl` | Allow development/test writes and DDL. |
| `admin_tools` | Allow administrative tasks such as dump/restore. |
| `prod_guarded` | Production profile. Read-only by default. |

## MCP Tools

Initial tools:

- `db_list_profiles`
- `db_resolve_context`
- `db_ping`
- `db_query`
- `db_execute`
- `db_seed`
- `db_list_tables`
- `db_table_schema`
- `db_explain`
- `db_suggest_profile`

`db_query` accepts read-only SQL only. `db_execute` handles writes and DDL after capability and safety checks.
`db_seed` runs multi-statement mock-data initialization through the same write guards.

## Profile Suggestions

The plugin is designed to improve with usage, but not by silently saving secrets.

When a conversation repeatedly includes connection details, the agent should:

1. summarize the repeated details
2. call `db_suggest_profile`
3. show the redacted suggestion
4. ask whether to add it to the user's local config

The plugin never needs raw passwords in profile files. Use environment variable references, Keychain-backed workflows, `.pgpass`, `.my.cnf`, or other local secret stores.

## Security Model

- No default profiles.
- No bundled personal credentials.
- Passwords should be referenced by environment variable names.
- Write profiles must be explicitly configured.
- `UPDATE` and `DELETE` without `WHERE` are blocked.
- dangerous SQL such as `DROP` and `TRUNCATE` requires explicit confirmation.
- All `db_execute` calls are written to an audit log.

Default audit log:

```text
~/.local/state/ai-db-client/audit.log
```

## Development

```bash
npm install
npm run build
npm run check
```

Run locally:

```bash
AI_DB_CLIENT_CONFIG_DIR=./local/config \
AI_DB_CLIENT_STATE_DIR=./local/state \
npm run dev
```

## Repository Contents

```text
.codex-plugin/plugin.json     Codex plugin manifest
.mcp.json                     Codex MCP server entry
skills/db-client/SKILL.md     Agent workflow instructions
src/                          MCP server implementation
config/*.schema.json          Profile and project config schemas
config/*.example.yaml         Public example config
README.zh-CN.md               Chinese documentation
```

## License

MIT
