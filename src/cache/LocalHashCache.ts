import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export class LocalHashCache {
  constructor(private readonly path: string) {}

  get(ecosystem: string): string | null {
    const data = this.readAll();
    return typeof data[ecosystem] === 'string' ? data[ecosystem] : null;
  }

  set(ecosystem: string, hash: string): void {
    const data = this.readAll();
    data[ecosystem] = hash;
    writeFileSync(this.path, JSON.stringify(data), 'utf8');
  }

  private readAll(): Record<string, string> {
    if (!existsSync(this.path)) {
      return {};
    }
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
}
