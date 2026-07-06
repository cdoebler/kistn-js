import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { InventoryClient } from '../../src/client/InventoryClient';
import { createInventoryPayload } from '../../src/dto/types';

describe('InventoryClient', () => {
  const client = new InventoryClient('https://example.com', 'proj-1', 'tok-1');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getHashes sends GET to project-level hashes endpoint with bearer token', async () => {
    (fetch as any).mockResolvedValue({ status: 200, text: async () => JSON.stringify({ composer: 'abc', npm: null }) });

    const hashes = await client.getHashes();

    expect(hashes['composer']).toBe('abc');
    expect(hashes['npm']).toBeNull();
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://example.com/api/projects/proj-1/hashes');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
  });

  it('getHashes returns null values for missing ecosystem hashes', async () => {
    (fetch as any).mockResolvedValue({ status: 200, text: async () => JSON.stringify({ npm: null }) });
    const hashes = await client.getHashes();
    expect(hashes['npm']).toBeNull();
  });

  it('getHashes returns empty object on invalid JSON', async () => {
    (fetch as any).mockResolvedValue({ status: 200, text: async () => 'not-json' });
    await expect(client.getHashes()).rejects.toThrow();
  });

  it('getHashes returns empty object when the response body is valid JSON but not an object', async () => {
    (fetch as any).mockResolvedValue({ status: 200, text: async () => 'null' });
    expect(await client.getHashes()).toEqual({});
  });

  it('push POSTs bundled ecosystems to project-level inventory endpoint', async () => {
    (fetch as any).mockResolvedValue({ status: 202, text: async () => '' });

    await client.push({
      npm: createInventoryPayload([
        { name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDirect: true, isDev: false, depth: 0 },
      ]),
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://example.com/api/projects/proj-1/inventory');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toHaveProperty('ecosystems');
    expect(body.ecosystems).toHaveProperty('npm');
    expect(body.ecosystems.npm.packages[0].name).toBe('lodash');
  });

  it('push bundles multiple ecosystems in one request', async () => {
    (fetch as any).mockResolvedValue({ status: 202, text: async () => '' });

    await client.push({
      npm: createInventoryPayload([{ name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDirect: true, isDev: false, depth: 0 }]),
      composer: createInventoryPayload([{ name: 'vendor/pkg', version: '1.0.0', ecosystem: 'composer', isDirect: true, isDev: false, depth: 0 }]),
    });

    expect((fetch as any).mock.calls).toHaveLength(1);
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.ecosystems).toHaveProperty('npm');
    expect(body.ecosystems).toHaveProperty('composer');
  });

  it('throws ApiException on non-2xx response', async () => {
    (fetch as any).mockResolvedValue({ status: 422, text: async () => '{"message":"bad"}' });
    await expect(client.getHashes()).rejects.toThrow(/422/);
  });

  describe('uploadFiles', () => {
    let tempDir: string;
    let tempFilePath: string;
    const fileContent = '{"name":"lodash"}';

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'inventory-client-test-'));
      tempFilePath = join(tempDir, 'package_lock.json');
      writeFileSync(tempFilePath, fileContent);
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('makes no fetch call when filePaths is empty', async () => {
      await client.uploadFiles({});
      expect(fetch).not.toHaveBeenCalled();
    });

    it('POSTs to project-level files endpoint (no ecosystem in URL)', async () => {
      (fetch as any).mockResolvedValue({ status: 202, text: async () => '' });

      await client.uploadFiles({ package_lock: tempFilePath });

      const [url] = (fetch as any).mock.calls[0];
      expect(url).toBe('https://example.com/api/projects/proj-1/files');
    });

    it('strips CR/LF and quotes from the field name so it cannot break out of the header', async () => {
      (fetch as any).mockResolvedValue({ status: 202, text: async () => '' });

      await client.uploadFiles({ 'evil"\r\nX-Injected: 1': tempFilePath });

      const [, init] = (fetch as any).mock.calls[0];
      const body: Buffer = Buffer.isBuffer(init.body) ? init.body : Buffer.from(init.body);
      const text = body.toString('latin1');
      expect(text).toContain('name="evilX-Injected: 1"');
      expect(text).not.toContain('X-Injected: 1\r\n');
    });

    it('POSTs a gzip-compressed multipart body that round-trips to the original content', async () => {
      (fetch as any).mockResolvedValue({ status: 202, text: async () => '' });

      await client.uploadFiles({ package_lock: tempFilePath });

      expect(fetch).toHaveBeenCalledTimes(1);
      const [, init] = (fetch as any).mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer tok-1');

      const contentType = init.headers['Content-Type'] as string;
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      expect(boundaryMatch).not.toBeNull();
      const boundary = boundaryMatch![1];

      const body: Buffer = Buffer.isBuffer(init.body) ? init.body : Buffer.from(init.body);

      const expectedDisposition = `Content-Disposition: form-data; name="package_lock"; filename="package_lock.json.gz"`;
      expect(body.toString('latin1')).toContain(expectedDisposition);

      const headerEnd = body.indexOf(Buffer.from('\r\n\r\n', 'latin1'));
      expect(headerEnd).toBeGreaterThan(-1);
      const dataStart = headerEnd + 4;

      const closingBoundary = Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1');
      const closingIndex = body.indexOf(closingBoundary);
      expect(closingIndex).toBeGreaterThan(-1);

      const compressed = body.subarray(dataStart, closingIndex);
      const decompressed = gunzipSync(compressed);

      expect(decompressed.toString('utf8')).toBe(fileContent);
    });
  });
});
