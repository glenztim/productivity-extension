import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest provides the auto-imports (`storage`, `browser`) and an in-memory fake browser for tests.
export default defineConfig({
  plugins: [WxtVitest()],
});
