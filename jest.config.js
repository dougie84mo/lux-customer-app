// Jest for the customer app. jest-expo transforms Expo/React Native + TS via
// babel-preset-expo; the moduleNameMapper mirrors the `@/*` path alias from
// tsconfig so tests import the same way the app does.
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
};
