import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DbProfile } from "./types.js";

export function audit(
  stateDir: string,
  event: {
    tool: string;
    profile: DbProfile;
    sql?: string;
    action?: string;
    dryRun?: boolean;
    ok: boolean;
    error?: string;
  },
): void {
  mkdirSync(stateDir, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    tool: event.tool,
    profile: event.profile.name,
    type: event.profile.type,
    database: event.profile.database,
    schema: event.profile.schema,
    action: event.action,
    dryRun: event.dryRun,
    ok: event.ok,
    error: event.error,
    sql: event.sql ? event.sql.slice(0, 4000) : undefined,
  };
  appendFileSync(join(stateDir, "audit.log"), `${JSON.stringify(entry)}\n`);
}
