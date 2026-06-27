# AI DB Client

AI DB Client 是一个本地优先的数据库插件，面向 Codex、Claude 等 AI Agent。它通过 MCP 提供带 profile、项目路由、安全写入保护和审计日志的数据库访问能力，目标是让 AI 能可靠地查询、初始化 mock 数据，并在必要时对开发库执行受控写入。

仓库不包含任何个人 profile、凭据或真实数据库地址。安装后由开发者自行配置本地 profile。

## 为什么需要它

AI 写代码时经常需要数据库上下文：查看 schema、确认记录、初始化 mock 数据、修复开发夹具数据。直接给终端权限虽然强大，但缺少结构化边界。AI DB Client 在 Agent 和数据库之间加了一层：

- 可复用本地 profile
- 项目到数据库的自动路由
- 读写能力等级
- 写入安全检查
- 审计日志
- 从高频对话内容中生成 profile 建议
- adapter 化数据库支持

安装这个 MCP 后，`db_check` 这类只读工具不再是必须的。`db_query`、`db_list_tables`、`db_table_schema` 已覆盖只读检查场景。如果你仍想保持只读行为，把 profile 的 `capability` 设置为 `read_only` 即可。

## 支持的数据库

当前骨架支持：

- PostgreSQL，基于 `pg`
- TimescaleDB，作为 PostgreSQL extension profile
- MySQL，基于 `mysql2`
- TDengine，基于官方 `taos` CLI

后续可以扩展 SQLite、DuckDB、ClickHouse、SQL Server、MongoDB、Redis/Valkey、InfluxDB 等。

## 安装

```bash
git clone https://github.com/zephyrcicd/ai-db-client.git
cd ai-db-client/plugins/ai-db-client
npm install
npm run build
```

### Codex Plugin

仓库包含：

```text
.codex-plugin/plugin.json
.mcp.json
skills/db-client/SKILL.md
```

通过 GitHub repository marketplace 安装：

```bash
codex plugin marketplace add zephyrcicd/ai-db-client
codex plugin add ai-db-client@ai-db-client
```

本地开发时，可以把 marketplace 命令指向仓库本地路径。

### Claude Desktop

在 Claude Desktop MCP 配置中加入：

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

修改后重启 Claude Desktop。

## 配置 Profile

创建本地配置目录：

```bash
mkdir -p ~/.config/ai-db-client
cp config/profiles.example.yaml ~/.config/ai-db-client/profiles.yaml
cp config/projects.example.yaml ~/.config/ai-db-client/projects.yaml
```

编辑复制后的文件。不要提交这些本地配置。

PostgreSQL 示例：

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

密码放到环境变量或本地 secret manager：

```bash
export APP_DEV_POSTGRES_PASSWORD='<set-in-your-shell>'
```

也可以把本地环境变量写入 `~/.config/ai-db-client/.env`。这个文件不属于插件仓库。

TimescaleDB 示例：

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

## 项目路由

把项目路径或仓库名映射到 profile：

```yaml
projects:
  - match: /path/to/your-app
    profile: app_dev
    database: app_dev
    schema: public
```

Agent 在该项目工作时，可以通过 `db_resolve_context` 自动选择数据库。

## 能力等级

| Capability | 含义 |
| --- | --- |
| `read_only` | 只允许查看 schema 和只读查询。 |
| `dev_write` | 允许在开发/测试库执行有边界的写入。 |
| `dev_ddl` | 允许开发/测试库写入和 DDL。 |
| `admin_tools` | 允许 dump/restore 等管理任务。 |
| `prod_guarded` | 生产 profile，默认只读。 |

## MCP Tools

初始工具：

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

`db_query` 只接受只读 SQL。`db_execute` 用于写入和 DDL，并会执行能力检查和安全检查。
`db_seed` 用于多语句 mock 数据初始化，走同样的写入保护。

## 自动进化：Profile 建议

插件可以随着使用变得更顺手，但不会静默保存敏感信息。

当对话里反复出现数据库连接信息时，Agent 应该：

1. 总结重复出现的连接信息
2. 调用 `db_suggest_profile`
3. 展示脱敏后的 profile 建议
4. 询问是否加入用户本地配置

profile 文件不应包含明文密码。请使用环境变量、Keychain、`.pgpass`、`.my.cnf` 或其他本地 secret store。

## 安全模型

- 默认没有任何 profile。
- 不包含个人凭据。
- 密码只通过环境变量名等方式引用。
- 写入能力必须显式配置。
- 阻止没有 `WHERE` 的 `UPDATE` 和 `DELETE`。
- `DROP`、`TRUNCATE` 等危险 SQL 需要显式确认。
- 所有 `db_execute` 调用都会写入审计日志。

默认审计日志：

```text
~/.local/state/ai-db-client/audit.log
```

## 开发

```bash
npm install
npm run build
npm run check
```

本地运行：

```bash
AI_DB_CLIENT_CONFIG_DIR=./local/config \
AI_DB_CLIENT_STATE_DIR=./local/state \
npm run dev
```

## 许可证

MIT
