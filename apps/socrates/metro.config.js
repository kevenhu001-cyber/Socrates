const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
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
module.exports = config;
