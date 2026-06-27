# AI DB Client Marketplace

This repository is a plugin marketplace for AI DB Client.

AI DB Client gives Codex and Claude a local-first MCP database client with profiles, project routing, write guards, seed helpers, and audit logs for PostgreSQL, TimescaleDB, MySQL, and TDengine.

Plugin documentation:

- [English](plugins/ai-db-client/README.md)
- [中文](plugins/ai-db-client/README.zh-CN.md)

## Install

Codex:

```bash
codex plugin marketplace add zephyrcicd/ai-db-client
codex plugin add ai-db-client@ai-db-client
```

Claude Code:

```bash
claude plugin marketplace add zephyrcicd/ai-db-client
claude plugin install ai-db-client@ai-db-client
```

## Local Configuration

Profiles and credentials are not stored in this repository. Configure them under:

```text
~/.config/ai-db-client
```

See [the plugin README](plugins/ai-db-client/README.md) for profile examples.
