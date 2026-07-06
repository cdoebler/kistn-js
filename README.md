# @kistn/js-client

Framework-agnostic Node client for the Kistn API. Supports npm, pnpm, yarn (classic + berry), and bun.

## Installation

```bash
npm install @kistn/js-client
```

## Setup

Copy `kistn.config.js.example` to `kistn.config.js` (or `.json`) in your project root:

```js
module.exports = {
  base_url: 'https://your-server.example',
  project_id: 'your-project-uuid-here',
  token: 'your-api-token-here',
  transmit_files: 'always', // 'always' | 'never' | 'on_demand'
};
```

Or set `KISTN_BASE_URL`, `KISTN_PROJECT_ID`, `KISTN_TOKEN` env vars (override file values).

> **Security:** `kistn.config.js` is executed as code when loaded (so it can read env vars, etc.).
> Anyone who can write it into your project root gets code execution wherever the CLI runs,
> including CI. Keep it under the same trust as your build scripts, or use `kistn.config.json`
> (parsed, never executed) and pass the token via `KISTN_TOKEN` in CI.

## Usage

```bash
npx kistn-push
```

Detects your package manager from the lockfile present (`bun.lock` → `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`), parses the package tree, runs that PM's audit/outdated commands for findings and available versions (best-effort — skipped gracefully if the PM CLI is unavailable), and pushes to the API.

### Push Flow

1. GET all ecosystem hashes — one call (`GET /hashes`), always runs.
2. Check local lockfile hash against local cache (`.inventory.hash`) — skip collection if unchanged.
3. Collect packages by parsing the lockfile directly.
4. Compute content hash — skip ecosystem if it matches the server's.
5. POST bundled payload (all changed ecosystems in one call).
6. Upload lockfile + `package.json` for ecosystems with package-level changes (per `transmit_files` mode).
7. Store lockfile hash in local cache.

## Known Limitations (v1)

- pnpm: single-project lockfileVersion 5/6 only — workspaces (`importers:`) and the v9 `snapshots:` format are rejected with a clear error.
- yarn: no monorepo support; `is_dev` is only known for direct dependencies.
- bun: legacy binary `bun.lockb` is not supported — upgrade to Bun ≥1.1 (text `bun.lock`).

## Architecture

```
InventoryPusher
├── InventoryClient        (HTTP: GET hashes, POST inventory, upload files)
├── CollectorInterface[]   (Npm/Pnpm/Yarn/BunCollector — one per project)
└── LocalHashCache         (file-based lockfile-hash cache)

CollectorInterface
├── NpmCollector   → package-lock.json + npm audit/outdated
├── PnpmCollector  → pnpm-lock.yaml + pnpm audit/outdated
├── YarnCollector  → yarn.lock (classic or berry, auto-detected) + yarn audit/outdated
└── BunCollector   → bun.lock + bun audit/outdated
```

## Testing

```bash
npm run test
npm run ci:check   # typecheck + test + build
```
