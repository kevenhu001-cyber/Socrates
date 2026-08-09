const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const contracts = path.resolve(__dirname, '../packages/contracts');
const brandAssets = path.resolve(__dirname, '../assets');
config.watchFolders = [contracts, brandAssets];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules')];
module.exports = config;
