import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts', 'lib/**/*.spec.ts', 'lib/**/__tests__/**/*.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
});
