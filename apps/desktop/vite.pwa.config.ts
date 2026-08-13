import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// 勤務員(スタッフ)向けPWA。個々の警備員がスマホで使う軽量アプリ。
//   - シフト希望提出 / 有給申請 / 講習会参加申込 / お知らせ・連絡
//   - インストール可能(manifest + service worker)。base は Web配信の /app/。
// 管理コンソール(現場/会社/運営)は別ビルド(vite.config.ts, base=/console/)。
export default defineConfig({
  base: process.env.VITE_PWA_BASE ?? '/app/',
  publicDir: 'pwa-public',
  plugins: [react()],
  resolve: {
    alias: {
      '@mamorai/input-core': fileURLToPath(
        new URL('../../packages/input-core/src/index.ts', import.meta.url)
      ),
    },
  },
  build: {
    outDir: 'dist-pwa',
    target: 'es2022',
    rollupOptions: { input: fileURLToPath(new URL('./pwa.html', import.meta.url)) },
  },
})
