import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    exclude: [
      ...configDefaults.exclude,
      'test/smoke.spec.ts',
      'test/browser/**'
    ],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/types/**']
    }
  }
})
