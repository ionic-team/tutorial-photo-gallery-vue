import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    // Scope collection to the unit dir so Cypress e2e specs under tests/e2e are
    // never picked up (Vitest's default exclude covers cypress/ but not tests/e2e/).
    include: ['tests/unit/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
