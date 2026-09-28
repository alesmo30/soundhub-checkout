// Runs after the webpack build (see package.json's build:lambda). Copies
// files the bundle needs at runtime but that webpack's node.__dirname =
// false makes __dirname-relative, not module-relative:
//
// - swagger-ui-dist's static assets: @nestjs/swagger resolves them at runtime
//   via `require('swagger-ui-dist/absolute-path.js')()`, which returns
//   swagger-ui-dist's own on-disk directory — a directory that does not exist
//   inside the Lambda zip (swagger-ui-dist is bundled as code, not shipped as
//   files) unless copied in next to the bundle.
// - certs/rds-global-bundle.pem: data-source.ts reads it relative to its own
//   __dirname, which resolves to dist-lambda/ once bundled.
// - seeds/data/*.json: run-seed.ts reads these relative to its own
//   __dirname too, for the same reason.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(SCRIPT_DIR, '..');
const OUTPUT_DIR = join(API_ROOT, 'dist-lambda');

const SWAGGER_UI_DIST_SOURCE = join(dirname(require.resolve('swagger-ui-dist/absolute-path.js')));

function copySwaggerUiAssets(): void {
  cpSync(SWAGGER_UI_DIST_SOURCE, OUTPUT_DIR, { recursive: true });
}

function copyRdsCaBundle(): void {
  const certsDir = join(OUTPUT_DIR, 'certs');
  mkdirSync(certsDir, { recursive: true });
  cpSync(join(API_ROOT, 'certs/rds-global-bundle.pem'), join(certsDir, 'rds-global-bundle.pem'));
}

function copySeedData(): void {
  const dataDir = join(OUTPUT_DIR, 'data');
  cpSync(join(API_ROOT, 'src/shared/infrastructure/persistence/seeds/data'), dataDir, {
    recursive: true,
  });
}

copySwaggerUiAssets();
copyRdsCaBundle();
copySeedData();
