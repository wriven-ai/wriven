//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Transpile the workspace contracts package (shipped as raw TS source) so
  // Next compiles its `@wriven/contracts` imports. Only the pure rbac.types
  // module is ever imported client-side; the NestJS/class-validator DTOs are
  // tree-shaken out.
  transpilePackages: ['@wriven/contracts'],
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
