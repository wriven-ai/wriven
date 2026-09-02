const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  externals: [
    // The plugin defaults its externals scan to the workspace-root node_modules,
    // which only holds root-manifest deps. Scan this app's own node_modules
    // (pnpm workspace) instead; @wriven/* TS-source libs stay bundled via allowlist.
    nodeExternals({
      modulesDir: join(__dirname, 'node_modules'),
      allowlist: [/^@wriven\//],
    }),
  ],
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      mergeExternals: true,
      // 'none' suppresses Nx's extra root-node_modules externalizer —
      // only the app-local externals above decide bundled vs required.
      externalDependencies: 'none',
    }),
  ],
};
