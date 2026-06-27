import { Capability, DbProfile } from "./types.js";

const WRITE_START = /^\s*(insert|update|delete|merge|replace|create|alter|drop|truncate|grant|revoke|comment|call)\b/i;
const DDL_START = /^\s*(create|alter|drop|truncate|grant|revoke|comment)\b/i;
const SELECTISH_START = /^\s*(select|with|show|describe|desc|explain)\b/i;
const UPDATE_DELETE_WITHOUT_WHERE = /^\s*(update\s+\S+\s+set|delete\s+from\s+\S+)\b(?![\s\S]*\bwhere\b)/i;
const DANGEROUS = /\b(drop|truncate)\b/i;

export function isReadOnlySql(sql: string): boolean {
  return SELECTISH_START.test(sql) && !WRITE_START.test(sql);
}

export function isWriteSql(sql: string): boolean {
  return WRITE_START.test(sql);
}

function canWrite(capability: Capability): boolean {
  return capability === "dev_write" || capability === "dev_ddl" || capability === "admin_tools";
}

function canDdl(capability: Capability): boolean {
  return capability === "dev_ddl" || capability === "admin_tools";
}

export function assertCanQuery(sql: string): void {
  if (!isReadOnlySql(sql)) {
    throw new Error("db_query only accepts read-only SQL. Use db_execute for writes.");
  }
}

export function assertCanExecute(
  profile: DbProfile,
  sql: string,
  options: { confirmed?: boolean; dryRun?: boolean } = {},
): void {
  if (!isWriteSql(sql)) return;

  if (!canWrite(profile.capability)) {
    throw new Error(`Profile ${profile.name} has capability ${profile.capability}; writes are not allowed.`);
  }

  if (DDL_START.test(sql) && !canDdl(profile.capability)) {
    throw new Error(`Profile ${profile.name} does not allow DDL. Use a dev_ddl or admin_tools profile.`);
  }

  if (profile.capability === "prod_guarded") {
    throw new Error("Production guarded profiles are read-only by default in this server.");
  }

  if (UPDATE_DELETE_WITHOUT_WHERE.test(sql)) {
    throw new Error("Refusing UPDATE/DELETE without WHERE.");
  }

  if (DANGEROUS.test(sql) && !options.confirmed && !options.dryRun) {
    throw new Error("Dangerous SQL requires confirmed=true.");
  }
}
