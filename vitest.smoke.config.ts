import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/smoke.spec.ts'],
    testTimeout: 120000
  }
})
