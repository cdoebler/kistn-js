import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../bin/kistn-push';

const minimalConfig = {
  base_url: 'https://kistn.com',
  project_id: 'proj-uuid-1234',
  token: 'test-token',
};

const minimalPackageLock = {
  name: 'test-app',
  lockfileVersion: 3,
  packages: {
    '': {
      name: 'test-app',
      dependencies: { lodash: '^4.17.21' },
    },
    'node_modules/lodash': {
      version: '4.17.21',
    },
  },
};

const minimalPackageJson = {
  name: 'test-app',
  dependencies: { lodash: '^4.17.21' },
};

describe('kistn-push main()', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'inv-bin-'));
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('exits with code 1 when config is missing', async () => {
    const code = await main(dir);

    expect(code).toBe(1);
  });

  it('exits with code 1 when no lockfile is found', async () => {
    writeFileSync(join(dir, 'kistn.config.json'), JSON.stringify(minimalConfig));
    // No lockfile written — detectPackageManager returns null

    const code = await main(dir);

    expect(code).toBe(1);
  });

  it('pushes successfully and returns 0 when lockfile and config are present', async () => {
    writeFileSync(join(dir, 'kistn.config.json'), JSON.stringify(minimalConfig));
    writeFileSync(join(dir, 'package.json'), JSON.stringify(minimalPackageJson));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(minimalPackageLock));

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/hash')) {
        return Promise.resolve({
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ hash: null })),
        });
      }
      // inventory push and file upload
      return Promise.resolve({
        status: 202,
        text: () => Promise.resolve(''),
      });
    }));

    const code = await main(dir);

    expect(code).toBe(0);
  });

  it('exits with code 1 and logs the error when pushAll() fails', async () => {
    writeFileSync(join(dir, 'kistn.config.json'), JSON.stringify(minimalConfig));
    writeFileSync(join(dir, 'package.json'), JSON.stringify(minimalPackageJson));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(minimalPackageLock));

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const code = await main(dir);

    expect(code).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('network down');
  });
});
