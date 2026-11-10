const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')];
/* Baseline typography: the SPA's @fontsource Inter / Noto Sans SC ship as
   woff2 (see assets/fonts + @socrates/theme FONT_FAMILY). Metro's default
   assetExts stop at ttf/otf, so the web-font formats have to be declared
   here or `require('../assets/fonts/*.woff2')` fails to resolve. */
config.resolver.assetExts = [...config.resolver.assetExts, 'woff', 'woff2'];
// Shared sources use Node-compatible .js specifiers for TypeScript modules.
// Metro does not strip that extension itself. Preserve real JS modules and
// resolve only missing relative .js paths that have a TypeScript source.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    const sourcePath = path.resolve(path.dirname(context.originModulePath), moduleName);
    if (!fs.existsSync(sourcePath) && ['.ts', '.tsx'].some(ext => fs.existsSync(sourcePath.slice(0, -3) + ext))) {
      return context.resolveRequest(context, moduleName.slice(0, -3), platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
