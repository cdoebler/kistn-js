import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Package, Finding, InventoryPayload } from '../dto/types';

export class ApiException extends Error {
  constructor(public readonly statusCode: number, public readonly body: string) {
    super(`API request failed with status ${statusCode}: ${body}`);
  }
}

// Strip CR/LF and quotes so a filename can't break out of the multipart header line.
function sanitizeHeaderValue(value: string): string {
  return value.replace(/["\r\n]/g, '');
}

export class InventoryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly projectId: string,
    private readonly token: string,
  ) {}

  async getHashes(): Promise<Record<string, string | null>> {
    const response = await fetch(`${this.baseUrl}/api/projects/${this.projectId}/hashes`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });

    const body = await response.text();
    this.assertSuccessful(response.status, body);

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`Invalid JSON in hashes response from ${this.baseUrl}`);
    }
    if (!data || typeof data !== 'object') {
      return {};
    }

    const result: Record<string, string | null> = {};
    for (const [ecosystem, hash] of Object.entries(data)) {
      result[ecosystem] = typeof hash === 'string' ? hash : null;
    }
    return result;
  }

  async push(payloads: Record<string, InventoryPayload>): Promise<void> {
    const ecosystems: Record<string, unknown> = {};

    for (const [ecosystem, payload] of Object.entries(payloads)) {
      ecosystems[ecosystem] = {
        packages: payload.packages.map((p: Package) => ({
          name: p.name,
          version: p.version,
          is_direct: p.isDirect,
          is_dev: p.isDev,
          depth: p.depth,
          available_version: p.availableVersion ?? null,
        })),
        findings: payload.findings.map((f: Finding) => ({
          package_name: f.packageName,
          package_version: f.packageVersion,
          advisory_id: f.advisoryId,
          severity: f.severity,
        })),
        private_packages: payload.privatePackages,
      };
    }

    const body = JSON.stringify({ ecosystems });

    const response = await fetch(`${this.baseUrl}/api/projects/${this.projectId}/inventory`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    this.assertSuccessful(response.status, await response.text());
  }

  async uploadFiles(filePaths: Record<string, string>): Promise<void> {
    if (Object.keys(filePaths).length === 0) {
      return;
    }

    const boundary = randomBytes(16).toString('hex');
    const body = this.buildMultipart(boundary, filePaths);

    const response = await fetch(`${this.baseUrl}/api/projects/${this.projectId}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Accept: 'application/json',
      },
      body,
    });

    this.assertSuccessful(response.status, await response.text());
  }

  private buildMultipart(boundary: string, filePaths: Record<string, string>): Buffer {
    const chunks: Buffer[] = [];

    for (const [fieldName, path] of Object.entries(filePaths)) {
      const raw = readFileSync(path);
      const compressed = gzipSync(raw);
      const name = sanitizeHeaderValue(fieldName);
      const gzFilename = `${sanitizeHeaderValue(basename(path))}.gz`;

      chunks.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${gzFilename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ));
      chunks.push(compressed);
      chunks.push(Buffer.from('\r\n'));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));

    return Buffer.concat(chunks);
  }

  private assertSuccessful(statusCode: number, body: string): void {
    if (statusCode < 200 || statusCode >= 300) {
      throw new ApiException(statusCode, body);
    }
  }
}
