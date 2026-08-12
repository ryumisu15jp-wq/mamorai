import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// [REQ-025] desktop 側テスト（tauriBridge の DI 検証）。
// UI(React) は対象外。抽象層の純粋な振る舞いのみを node 環境で検証する。
export default defineConfig({
  resolve: {
    alias: {
      '@mamorai/input-core': fileURLToPath(
        new URL('../../packages/input-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
})
