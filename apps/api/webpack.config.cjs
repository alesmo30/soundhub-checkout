// CommonJS interop shim consumed by the Nest CLI webpack builder; no typed
// declarations exist for webpack-node-externals.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
const nodeExternals = require('webpack-node-externals');

module.exports = (options) => ({
  ...options,
  externals: [
    nodeExternals({
      allowlist: [/^@checkout\//],
    }),
  ],
});
