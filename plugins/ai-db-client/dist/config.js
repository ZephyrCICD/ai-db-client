import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
function expandHome(path) {
    if (path === "~")
        return homedir();
    if (path.startsWith("~/"))
        return join(homedir(), path.slice(2));
    return path;
}
function readYamlFile(path) {
    if (!existsSync(path))
        return undefined;
    return YAML.parse(readFileSync(path, "utf8"));
}
function loadEnvFile(path) {
    if (!existsSync(path))
        return;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
            continue;
        const [rawKey, ...rest] = trimmed.split("=");
        const key = rawKey.trim();
        if (!key || process.env[key] !== undefined)
            continue;
        let value = rest.join("=").trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}
function loadProfiles(configDir) {
    const profileFile = ["profiles.yaml", "profiles.yml", "profiles.json"]
        .map((name) => join(configDir, name))
        .find((path) => existsSync(path));
    const profiles = new Map();
    if (!profileFile)
        return profiles;
    const raw = readYamlFile(profileFile);
    for (const [name, profile] of Object.entries(raw?.profiles ?? {})) {
        profiles.set(name, { name, ...profile });
    }
    return profiles;
}
function loadProjects(configDir) {
    const projectFile = ["projects.yaml", "projects.yml", "projects.json"]
        .map((name) => join(configDir, name))
        .find((path) => existsSync(path));
    if (!projectFile)
        return [];
    const raw = readYamlFile(projectFile);
    return raw?.projects ?? [];
}
export function loadConfig() {
    const configDir = resolve(expandHome(process.env.AI_DB_CLIENT_CONFIG_DIR ?? "~/.config/ai-db-client"));
    const stateDir = resolve(expandHome(process.env.AI_DB_CLIENT_STATE_DIR ?? "~/.local/state/ai-db-client"));
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
export function resolveContext(config, profileName, projectPath, database, schema) {
    let selectedProfile = profileName;
    let route;
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
