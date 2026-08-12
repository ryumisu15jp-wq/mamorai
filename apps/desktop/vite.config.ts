import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// WebView2 前提の PC 専用 MVP。Tauri v2 が dist/ をラップして配布する。
// @mamorai/input-core は workspace のソース(TS)を直接束ねる（dist ビルド不要）。
// base はデプロイ形態で切替:
//   - Tauri(.exe)/ルート配信: '/'（既定）
//   - Web(サブパス配信): VITE_BASE=/app/ でビルド → /co/ /s/ /tradmin/ を SPA フォールバックで配信
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@mamorai/input-core': fileURLToPath(
        new URL('../../packages/input-core/src/index.ts', import.meta.url)
      ),
    },
  },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'es2022' },
})
