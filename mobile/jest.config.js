module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/../packages/core/src'],
  testPathIgnorePatterns: ['/node_modules/', '/android/'],
  moduleNameMapper: {
    '^@socrates/contracts$': '<rootDir>/../packages/contracts/src/index.ts',
    '^@socrates/core$': '<rootDir>/../packages/core/src/index.ts',
  },
};
