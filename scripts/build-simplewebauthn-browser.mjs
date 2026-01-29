// scripts/build-simplewebauthn-browser.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(repoRoot, '..');
const pkgPath = require.resolve('@simplewebauthn/browser/package.json');
const pkgJson = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
const moduleEntry = pkgJson.module;
const mainEntry = pkgJson.main;
const entryPoint = moduleEntry
  ? path.resolve(path.dirname(pkgPath), moduleEntry)
  : path.resolve(path.dirname(pkgPath), mainEntry || 'dist/bundle/index.js');

const outDir = path.join(projectRoot, 'public', 'vendor');
const outFile = path.join(outDir, 'simplewebauthn-browser-9.0.1.bundle.js');

await fs.mkdir(outDir, { recursive: true });

if (moduleEntry) {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    outfile: outFile,
    sourcemap: false,
    banner: {
      js: '// public/vendor/simplewebauthn-browser-9.0.1.bundle.js',
    },
    logLevel: 'info',
  });
} else {
  const source = await fs.readFile(entryPoint, 'utf8');
  const banner = '// public/vendor/simplewebauthn-browser-9.0.1.bundle.js\\n';
  await fs.writeFile(outFile, banner + source, 'utf8');
}
