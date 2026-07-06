import { createHash } from 'node:crypto';
import { InventoryPayload } from './dto/types';

interface HashedPackage {
  name: string;
  version: string;
  is_direct: boolean;
  is_dev: boolean;
  depth: number | null;
}

/**
 * Re-creates PHP's default `json_encode` escaping so the resulting byte
 * stream — and therefore the sha256 hash — matches the PHP client exactly.
 * PHP escapes `/` as `\/` and any non-ASCII code point as `\uXXXX` unless
 * the caller passes JSON_UNESCAPED_SLASHES / JSON_UNESCAPED_UNICODE, which
 * the PHP HashComputer does not.
 */
function phpStyleJsonEncode(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\//g, '\\/')
    .replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function computeHash(payload: InventoryPayload): string {
  const reduced: HashedPackage[] = payload.packages.map((p) => ({
    name: p.name,
    version: p.version,
    is_direct: p.isDirect,
    is_dev: p.isDev,
    depth: p.depth,
  }));

  reduced.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return createHash('sha256').update(phpStyleJsonEncode(reduced)).digest('hex');
}
