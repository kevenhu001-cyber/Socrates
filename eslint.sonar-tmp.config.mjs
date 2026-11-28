import { createRequire } from 'node:module';

const require = createRequire('C:/Users/Jiacheng/Desktop/Socrates/frontend/package.json');
const tseslint = require('typescript-eslint');

export default [
  {
    files: ['frontend/src/**/*.{js,mjs,ts,tsx}', 'server/src/**/*.{js,ts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
];
