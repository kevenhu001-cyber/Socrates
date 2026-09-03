module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src', '<rootDir>/../packages/core/src'],
  testPathIgnorePatterns: ['/node_modules/', '/android/'],
  /* Animated.loop in Skeleton / Toast / MessageBubble streaming ring
   * never resolves, so the worker holds an open handle after the test
   * passes. forceExit avoids the 30s Jest hang on CI. */
  forceExit: true,
  moduleNameMapper: {
    '^@socrates/contracts$': '<rootDir>/../packages/contracts/src/index.ts',
    '^@socrates/core$': '<rootDir>/../packages/core/src/index.ts',
    '^@socrates/theme$': '<rootDir>/../packages/theme/src/index.ts',
  },
};
