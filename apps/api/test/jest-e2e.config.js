/** Testes ponta a ponta: sobem a API inteira contra um Postgres de teste. */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }] },
  moduleNameMapper: { '^@quem/(shared|cloud)$': '<rootDir>/../../packages/$1/src' },
  testTimeout: 30000,
};
