module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^inquirer$': '<rootDir>/src/__mocks__/inquirer.js',
    '^ora$': '<rootDir>/src/__mocks__/ora.js',
    '^chalk$': '<rootDir>/src/__mocks__/chalk.js',
  },
};
