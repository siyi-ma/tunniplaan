// Bundle the Sites worker to a single ES module.
//
// platform neutral, so a stray `node:` import fails the build instead of
// being rewritten into something the Site cannot run. Secrets are not
// compiled in: the handler reads them from the request env.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [path.join(root, 'sites/worker/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: path.join(root, 'dist/server/index.js'),
  conditions: ['worker', 'browser', 'import', 'default'],
  mainFields: ['browser', 'module', 'main'],
  legalComments: 'none',
  logLevel: 'info',
});
