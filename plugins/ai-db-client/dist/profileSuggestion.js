function redact(value) {
    return value
        .replace(/(password|passwd|pwd|token|secret)=([^&\s]+)/gi, "$1=<redacted>")
        .replace(/:\/\/([^:\s/@]+):([^@\s]+)@/g, "://$1:<redacted>@");
}
function detectType(text) {
    const lower = text.toLowerCase();
    if (lower.includes("postgresql://") || lower.includes("postgres://") || lower.includes("postgres"))
        return "postgres";
    if (lower.includes("mysql://") || lower.includes("mysql"))
        return "mysql";
    if (lower.includes("tdengine") || lower.includes("taos"))
        return "tdengine";
    return undefined;
}
function detectPort(text, type) {
    const explicit = text.match(/\b(?:port|p)\s*[:=]\s*(\d{2,5})\b/i)?.[1];
    if (explicit)
        return Number(explicit);
    if (type === "postgres")
        return 5432;
    if (type === "mysql")
        return 3306;
    if (type === "tdengine")
        return 6030;
    return undefined;
}
export function suggestProfile(input) {
    const type = detectType(input.text);
    const host = input.text.match(/\b(?:host|hostname|h)\s*[:=]\s*([^\s,;]+)/i)?.[1];
    const database = input.text.match(/\b(?:database|dbname|db|d)\s*[:=]\s*([^\s,;]+)/i)?.[1];
    const schema = input.text.match(/\b(?:schema|search_path)\s*[:=]\s*([^\s,;]+)/i)?.[1];
    const user = input.text.match(/\b(?:user|username|u)\s*[:=]\s*([^\s,;]+)/i)?.[1];
    const port = detectPort(input.text, type);
    const name = input.preferredName ??
        [input.projectPath?.split("/").filter(Boolean).pop(), type, database]
            .filter(Boolean)
            .join("_")
            .replace(/[^a-zA-Z0-9_]+/g, "_")
            .toLowerCase();
    return {
        summary: "Review this suggestion with the user before writing it to profiles.yaml.",
        redactedSource: redact(input.text),
        profileName: name || "new_database_profile",
        profile: {
            type,
            host,
            port,
            database,
            schema,
            user,
            passwordEnv: type ? `${name || "DB"}_PASSWORD`.toUpperCase() : undefined,
            capability: "read_only",
            defaultLimit: 100,
            maxRows: 5000,
            maxAffectedRows: 1000,
            description: "Suggested from conversation context. Confirm before use.",
        },
    };
}
