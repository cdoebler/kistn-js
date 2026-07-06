import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: { entry: 'src/index.ts' },
    splitting: false,
    sourcemap: true,
    clean: true,
    target: 'node18',
  },
  {
    // ESM only: the bin relies on import.meta for its symlink-safe entry-point
    // check, which esbuild can't support under the "cjs" output format — and
    // package.json's "bin" field only ever points at the ESM file anyway.
    entry: { 'bin/kistn-push': 'bin/kistn-push.ts' },
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    clean: false,
    target: 'node18',
  },
]);
