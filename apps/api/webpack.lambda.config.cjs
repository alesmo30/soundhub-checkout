// CommonJS interop shim consumed by the Nest CLI webpack builder; no typed
// declarations exist for it, and it receives webpack's own untyped options
// object and plugin classes (same shape as webpack.config.cjs).
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
// Nest CLI webpack config for the Lambda bundle (see specs/09-infra-first-deploy.md,
// Decisions > Bundling). Unlike webpack.config.cjs (used for the local `dist/`
// build, where node_modules stay on disk next to dist/main.js), this bundle has
// no node_modules deployed alongside it in the Lambda zip, so node_modules are
// bundled in rather than externalized.
//
// The Nest CLI webpack builder invokes this file's export once per entry
// (an array of factories), merging each result over its own defaultOptions
// (single `main.ts` entry/output). Every entry below must therefore set its
// own `entry`/`output.filename` explicitly, or both bundles would silently
// compile `main.ts` instead of `lambda.ts` / `migrator.handler.ts`.
const path = require('node:path');

const OUTPUT_PATH = path.resolve(__dirname, 'dist-lambda');

// TypeORM's DriverFactory statically requires every driver class, and each
// driver module in turn does `PlatformTools.load(<db client package name>)`
// for its own client library. Postgres is the only driver this app uses
// (buildDataSourceOptions always sets type: 'postgres'), so the client
// packages for every other driver are dead weight webpack would otherwise
// try to resolve into the bundle. `pg-native` is postgres' own optional
// native accelerator, also unused (plain `pg` is what's installed).
const UNUSED_OPTIONAL_DB_MODULES = [
  'pg-native',
  'mysql',
  'mysql2',
  'oracledb',
  'mssql',
  'sqlite3',
  'better-sqlite3',
  'sql.js',
  'mongodb',
  '@sap/hana-client',
  '@sap/hana-client/extension/Stream',
  'hdb-pool',
  'ioredis',
  'redis',
  '@google-cloud/spanner',
  'typeorm-aurora-data-api-driver',
  'react-native-sqlite-storage',
  'expo-sqlite',
];

// Nest's own dynamic requires for transports/adapters this app never uses
// (no WebSocket gateways, no microservices, no fastify — Express only).
// The Nest CLI's default IgnorePlugin (spread in via ...options.plugins,
// see webpack-defaults.js) already covers the bare module names, but
// @nestjs/core's socket-module/microservices-module lookups build the
// request as a string concatenation ending in `.js`, so the bare-name
// entries in that default list never match here — these packages are not
// installed at all, and bundling with externals: [] forces webpack to
// actually resolve them instead of nodeExternals silently passing them
// through.
const UNUSED_OPTIONAL_FRAMEWORK_MODULES = [
  '@nestjs/websockets/socket-module',
  '@nestjs/websockets/socket-module.js',
  '@nestjs/microservices',
  '@nestjs/microservices/microservices-module',
  '@nestjs/microservices/microservices-module.js',
  '@fastify/static',
];

function buildEntryConfig(options, webpack, entry) {
  return {
    ...options,
    entry: path.resolve(__dirname, entry.sourcePath),
    output: {
      ...options.output,
      path: OUTPUT_PATH,
      filename: `${entry.name}.js`,
      libraryTarget: 'commonjs2',
    },
    // Bundle node_modules (the Lambda zip ships no node_modules of its own),
    // aside from Node's own built-ins, which externalsPresets.node already
    // keeps external in options.
    externals: [],
    plugins: [
      ...options.plugins,
      new webpack.IgnorePlugin({
        checkResource(resource) {
          return (
            UNUSED_OPTIONAL_DB_MODULES.includes(resource) ||
            UNUSED_OPTIONAL_FRAMEWORK_MODULES.includes(resource)
          );
        },
      }),
    ],
  };
}

module.exports = [
  (options, webpack) =>
    buildEntryConfig(options, webpack, { name: 'lambda', sourcePath: 'src/lambda.ts' }),
  (options, webpack) =>
    buildEntryConfig(options, webpack, {
      name: 'migrator',
      sourcePath: 'src/workers/migrator.handler.ts',
    }),
  (options, webpack) =>
    buildEntryConfig(options, webpack, {
      name: 'reconciler',
      sourcePath: 'src/workers/reconciler.handler.ts',
    }),
];
