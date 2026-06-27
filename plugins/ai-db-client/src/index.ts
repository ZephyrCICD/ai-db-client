#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { audit } from "./audit.js";
import { loadConfig, resolveContext } from "./config.js";
import { getAdapter } from "./adapters/index.js";
import { assertCanExecute, assertCanQuery } from "./safety.js";
import { suggestProfile } from "./profileSuggestion.js";

const config = loadConfig();

const server = new McpServer({
  name: "ai-db-client",
  version: "0.1.2",
});

const contextShape = {
  profile: z.string().optional().describe("Configured database profile name."),
  projectPath: z.string().optional().describe("Current project path used by project routing."),
  database: z.string().optional().describe("Override database/dbname for this call."),
  schema: z.string().optional().describe("Override schema/search_path for this call."),
};

function ctx(args: {
  profile?: string;
  projectPath?: string;
  database?: string;
  schema?: string;
}) {
  return resolveContext(config, args.profile, args.projectPath, args.database, args.schema);
}

function jsonText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

server.tool("db_list_profiles", {}, async () => {
  return jsonText({
    configDir: config.configDir,
    stateDir: config.stateDir,
    profiles: [...config.profiles.values()].map((profile) => ({
      name: profile.name,
      type: profile.type,
      database: profile.database,
      schema: profile.schema,
      capability: profile.capability,
      extensions: profile.extensions ?? [],
      description: profile.description,
    })),
  });
});

server.tool(
  "db_resolve_context",
  {
    ...contextShape,
  },
  async (args) => {
    const resolved = ctx(args);
    return jsonText({
      profile: resolved.profile.name,
      type: resolved.profile.type,
      database: resolved.database,
      schema: resolved.schema,
      capability: resolved.profile.capability,
      route: resolved.route,
    });
  },
);

server.tool(
  "db_ping",
  {
    ...contextShape,
  },
  async (args) => {
    const resolved = ctx(args);
    const adapter = getAdapter(resolved.profile.type);
    return jsonText(await adapter.ping(resolved));
  },
);

server.tool(
  "db_query",
  {
    ...contextShape,
    sql: z.string().describe("Read-only SQL."),
    params: z.array(z.unknown()).optional(),
    limit: z.number().int().positive().max(10000).optional(),
  },
  async (args) => {
    const resolved = ctx(args);
    assertCanQuery(args.sql);
    const adapter = getAdapter(resolved.profile.type);
    return jsonText(await adapter.query(resolved, args));
  },
);

server.tool(
  "db_execute",
  {
    ...contextShape,
    sql: z.string().describe("Write or DDL SQL. Guarded by profile capability and safety policy."),
    params: z.array(z.unknown()).optional(),
    confirmed: z.boolean().optional().describe("Required for dangerous operations."),
    dryRun: z.boolean().optional().describe("Validate capability and policy without executing."),
  },
  async (args) => {
    const resolved = ctx(args);
    const adapter = getAdapter(resolved.profile.type);
    try {
      assertCanExecute(resolved.profile, args.sql, args);
      const result = await adapter.execute(resolved, args);
      audit(config.stateDir, { tool: "db_execute", profile: resolved.profile, sql: args.sql, dryRun: args.dryRun, ok: true });
      return jsonText(result);
    } catch (error) {
      audit(config.stateDir, {
        tool: "db_execute",
        profile: resolved.profile,
        sql: args.sql,
        dryRun: args.dryRun,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
);

server.tool(
  "db_seed",
  {
    ...contextShape,
    statements: z.array(z.string()).min(1).describe("Idempotent seed or mock-data SQL statements."),
    confirmed: z.boolean().optional().describe("Required for dangerous operations."),
    dryRun: z.boolean().optional().describe("Validate capability and policy without executing."),
  },
  async (args) => {
    const resolved = ctx(args);
    const adapter = getAdapter(resolved.profile.type);
    const results = [];
    try {
      for (const sql of args.statements) {
        assertCanExecute(resolved.profile, sql, args);
        results.push(await adapter.execute(resolved, { sql, confirmed: args.confirmed, dryRun: args.dryRun }));
      }
      audit(config.stateDir, {
        tool: "db_seed",
        profile: resolved.profile,
        action: `${args.statements.length} statements`,
        dryRun: args.dryRun,
        ok: true,
      });
      return jsonText({
        profile: resolved.profile.name,
        database: resolved.database,
        schema: resolved.schema,
        dryRun: args.dryRun,
        statementCount: args.statements.length,
        results,
      });
    } catch (error) {
      audit(config.stateDir, {
        tool: "db_seed",
        profile: resolved.profile,
        action: `${args.statements.length} statements`,
        dryRun: args.dryRun,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
);

server.tool(
  "db_list_tables",
  {
    ...contextShape,
  },
  async (args) => {
    const resolved = ctx(args);
    const adapter = getAdapter(resolved.profile.type);
    return jsonText(await adapter.listTables(resolved));
  },
);

server.tool(
  "db_table_schema",
  {
    ...contextShape,
    table: z.string(),
  },
  async (args) => {
    const resolved = ctx(args);
    const adapter = getAdapter(resolved.profile.type);
    return jsonText(await adapter.tableSchema(resolved, args.table));
  },
);

server.tool(
  "db_explain",
  {
    ...contextShape,
    sql: z.string(),
  },
  async (args) => {
    const resolved = ctx(args);
    const adapter = getAdapter(resolved.profile.type);
    if (!adapter.explain) throw new Error(`${resolved.profile.type} adapter does not support explain yet.`);
    return jsonText(await adapter.explain(resolved, args.sql));
  },
);

server.tool(
  "db_suggest_profile",
  {
    text: z.string().describe("Conversation text or connection notes to summarize into a profile suggestion."),
    preferredName: z.string().optional(),
    projectPath: z.string().optional(),
  },
  async (args) => {
    return jsonText(suggestProfile(args));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
