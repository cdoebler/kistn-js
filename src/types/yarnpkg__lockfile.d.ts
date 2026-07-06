// `@yarnpkg/lockfile` ships no types and no `@types/yarnpkg__lockfile` package exists.
// Minimal ambient declaration covering only the shape this client uses.
declare module '@yarnpkg/lockfile' {
  export interface ParseResult {
    type: 'success' | 'merge' | 'conflict';
    object: Record<string, { version?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
  }

  export function parse(content: string): ParseResult;
}
