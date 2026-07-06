#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '../src/Config';
import { InventoryClient } from '../src/client/InventoryClient';
import { LocalHashCache } from '../src/cache/LocalHashCache';
import { ShellProcessRunner } from '../src/process/ProcessRunner';
import { detectPackageManager } from '../src/detectPackageManager';
import { InventoryPusher } from '../src/InventoryPusher';

export async function main(projectDir: string): Promise<number> {
  const jsConfigPath = join(projectDir, 'kistn.config.js');
  const jsonConfigPath = join(projectDir, 'kistn.config.json');
  const configPath = existsSync(jsConfigPath) ? jsConfigPath : jsonConfigPath;

  let config: Config;
  try {
    config = await Config.load(configPath);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const runner = new ShellProcessRunner();
  const collector = detectPackageManager(projectDir, runner);

  if (collector === null) {
    console.error('No supported package manager lockfile found in: ' + projectDir);
    return 1;
  }

  const client = new InventoryClient(config.baseUrl, config.projectId, config.token);
  const cache = new LocalHashCache(join(projectDir, '.inventory.hash'));
  const pusher = new InventoryPusher(client, [collector], cache, config.transmitFiles);

  try {
    await pusher.pushAll();
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  return 0;
}

// realpath argv[1] before comparing: npm's `.bin` shim is a symlink, so
// argv[1] is the symlink path while import.meta.url is already the resolved
// target — a naive equality check never matches and main() silently never runs.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.cwd()).then((code) => process.exit(code));
}
