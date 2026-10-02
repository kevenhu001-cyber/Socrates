module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/../packages/core/src'],
  testPathIgnorePatterns: ['/node_modules/', '/android/'],
  moduleNameMapper: {
    // packages/core tests live outside mobile/, so their babel-injected
    // @babel/runtime helper imports cannot see mobile/node_modules on the
    // normal walk-up path. Pin them to the installed copy.
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    '^@socrates/contracts$': '<rootDir>/../packages/contracts/src/index.ts',
    '^@socrates/core$': '<rootDir>/../packages/core/src/index.ts',
    '^@socrates/theme$': '<rootDir>/../packages/theme/src/index.ts',
    // packages/core tests are node:test files (they also run via `node
    // --test` in ci.yml). Rebind the runner calls onto jest globals.
    '^node:test$': '<rootDir>/test/node-test-shim.cjs',
  },
};
