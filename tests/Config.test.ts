import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Config } from '../src/Config';
import { TransmitMode } from '../src/TransmitMode';

describe('Config.load', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'inv-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.KISTN_TOKEN;
  });

  it('loads values from a config file', async () => {
    const path = join(dir, 'kistn.config.json');
    writeFileSync(path, JSON.stringify({ base_url: 'https://example.com/', project_id: 'p1', token: 't1' }));

    const config = await Config.load(path);

    expect(config.baseUrl).toBe('https://example.com'); // trailing slash stripped
    expect(config.projectId).toBe('p1');
    expect(config.token).toBe('t1');
    expect(config.transmitFiles).toBe(TransmitMode.Never);
  });

  it('loads values from a .js config file (CJS module.exports)', async () => {
    const path = join(dir, 'kistn.config.js');
    writeFileSync(path, "module.exports = { base_url: 'https://example.com', project_id: 'p1', token: 't1' };\n");

    const config = await Config.load(path);

    expect(config.projectId).toBe('p1');
  });

  it('loads values from a .mjs config file (ESM export default)', async () => {
    const path = join(dir, 'kistn.config.mjs');
    writeFileSync(path, "export default { base_url: 'https://example.com', project_id: 'p1', token: 't1' };\n");

    const config = await Config.load(path);

    expect(config.projectId).toBe('p1');
  });

  it('reads transmit_files from the config file', async () => {
    const path = join(dir, 'kistn.config.json');
    writeFileSync(
      path,
      JSON.stringify({ base_url: 'https://example.com', project_id: 'p1', token: 't1', transmit_files: 'never' }),
    );

    const config = await Config.load(path);

    expect(config.transmitFiles).toBe(TransmitMode.Never);
  });

  it('env var overrides file token', async () => {
    const path = join(dir, 'kistn.config.json');
    writeFileSync(path, JSON.stringify({ base_url: 'https://example.com', project_id: 'p1', token: 'file-token' }));
    process.env.KISTN_TOKEN = 'env-token';

    const config = await Config.load(path);

    expect(config.token).toBe('env-token');
  });

  it('throws when a required key is missing', async () => {
    const path = join(dir, 'kistn.config.json');
    writeFileSync(path, JSON.stringify({ base_url: 'https://example.com' }));

    await expect(Config.load(path)).rejects.toThrow(/project_id/);
  });

  it('throws when the file does not exist', async () => {
    await expect(Config.load(join(dir, 'missing.json'))).rejects.toThrow(/not found/);
  });

  it('throws with file path context when the config file has invalid syntax', async () => {
    const path = join(dir, 'kistn.config.json');
    writeFileSync(path, '{ invalid json');

    await expect(Config.load(path)).rejects.toThrow(path);
  });
});
