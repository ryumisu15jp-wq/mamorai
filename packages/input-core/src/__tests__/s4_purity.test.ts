// [Sprint4] 純粋性・秘匿境界の静的確認: notify/training/template のソースを走査で検証
// 通知・資格分類・テンプレ設定は UI/DB/外部I/O 非依存かつ決定論であることを担保する。
// テスト規約: AAA / 「対象_条件_期待」
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '..')

function readSrc(rel: string): string {
  return readFileSync(resolve(srcRoot, rel), 'utf8')
}

const s4Files = ['notify/model.ts', 'training/model.ts', 'template/config.ts']

// UI/DB/グローバル/外部I/O/機密 の禁止パターン
const forbidden = [
  { label: 'react', re: /from\s+['"]react['"]|require\(\s*['"]react['"]\s*\)/ },
  { label: 'react-native', re: /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]\s*\)/ },
  { label: '@supabase', re: /from\s+['"]@supabase[^'"]*['"]|require\(\s*['"]@supabase[^'"]*['"]\s*\)/ },
  { label: 'window', re: /\bwindow\b/ },
  { label: 'document', re: /\bdocument\b/ },
  { label: 'fetch', re: /\bfetch\s*\(/ },
  { label: 'process.env', re: /process\.env/ },
]

// 非決定性の禁止（日付は 'YYYY-MM-DD' 文字列＋referenceDate 引数で扱う）
const forbiddenNondeterminism = [
  { label: 'Date.now', re: /Date\.now\s*\(/ },
  { label: 'Math.random', re: /Math\.random\s*\(/ },
  { label: 'new Date()（引数なし）', re: /new\s+Date\s*\(\s*\)/ },
]

describe('Sprint4 純粋性・秘匿境界 [REQ-022..024]', () => {
  it('s4purity_全ソースが走査できる', () => {
    // Arrange & Act
    const codes = s4Files.map((f) => readSrc(f))
    // Assert
    expect(codes.every((c) => c.length > 0)).toBe(true)
  })

  it('s4purity_notify/training/templateソース_UI/DB/外部I/O/機密を参照しない', () => {
    // Arrange & Act & Assert
    for (const f of s4Files) {
      const code = readSrc(f)
      for (const rule of forbidden) {
        expect(rule.re.test(code), `${f} が ${rule.label} を参照している`).toBe(false)
      }
    }
  })

  it('s4purity_notify/training/templateソース_非決定的APIを参照しない', () => {
    // Arrange & Act & Assert
    for (const f of s4Files) {
      const code = readSrc(f)
      for (const rule of forbiddenNondeterminism) {
        expect(rule.re.test(code), `${f} が ${rule.label} を参照している`).toBe(false)
      }
    }
  })
})
