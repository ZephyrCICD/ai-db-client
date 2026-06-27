import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { DbProfile, ProjectRoute, ResolvedContext } from "./types.js";

export interface ClientConfig {
  profiles: Map<string, DbProfile>;
  projects: ProjectRoute[];
  configDir: string;
  stateDir: string;
}

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function readYamlFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return YAML.parse(readFileSync(path, "utf8")) as T;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey.trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadProfiles(configDir: string): Map<string, DbProfile> {
  const profileFile = ["profiles.yaml", "profiles.yml", "profiles.json"]
    .map((name) => join(configDir, name))
    .find((path) => existsSync(path));
  const profiles = new Map<string, DbProfile>();
  if (!profileFile) return profiles;

  const raw = readYamlFile<{ profiles?: Record<string, Omit<DbProfile, "name">> }>(profileFile);
  for (const [name, profile] of Object.entries(raw?.profiles ?? {})) {
    profiles.set(name, { name, ...profile });
  }
  return profiles;
}

function loadProjects(configDir: string): ProjectRoute[] {
  const projectFile = ["projects.yaml", "projects.yml", "projects.json"]
    .map((name) => join(configDir, name))
    .find((path) => existsSync(path));
  if (!projectFile) return [];
  const raw = readYamlFile<{ projects?: ProjectRoute[] }>(projectFile);
  return raw?.projects ?? [];
}

export function loadConfig(): ClientConfig {
  const configDir = resolve(
    expandHome(process.env.AI_DB_CLIENT_CONFIG_DIR ?? "~/.config/ai-db-client"),
  );
  const stateDir = resolve(
    expandHome(process.env.AI_DB_CLIENT_STATE_DIR ?? "~/.local/state/ai-db-client"),
  );
  mkdirSync(configDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  loadEnvFile(join(configDir, ".env"));
  return {
    profiles: loadProfiles(configDir),
    projects: loadProjects(configDir),
    configDir,
    stateDir,
  };
}

export function resolveContext(
  config: ClientConfig,
  profileName?: string,
  projectPath?: string,
  database?: string,
  schema?: string,
): ResolvedContext {
  let selectedProfile = profileName;
  let route: ProjectRoute | undefined;

  if (!selectedProfile && projectPath) {
    const normalizedPath = resolve(projectPath);
    route = config.projects.find((candidate) => normalizedPath.includes(candidate.match));
    selectedProfile = route?.profile;
  }

  if (!selectedProfile && config.profiles.size === 1) {
    selectedProfile = [...config.profiles.keys()][0];
  }

  if (!selectedProfile) {
    throw new Error("No profile selected. Provide profile or configure a matching project route.");
  }

  const profile = config.profiles.get(selectedProfile);
  if (!profile) {
    throw new Error(`Unknown database profile: ${selectedProfile}`);
  }

  return {
    profile,
    database: database ?? route?.database ?? profile.database,
    schema: schema ?? route?.schema ?? profile.schema,
    route,
  };
}
