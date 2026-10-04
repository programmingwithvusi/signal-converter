import { defineConfig } from 'vitest/config'

// Firestore rules tests. They need the emulator, so they run through `npm run test:rules`
// rather than the default `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/rules/**/*.emulator.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
