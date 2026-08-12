// [Sprint3] 純粋性・秘匿境界の静的確認: shift/*.ts をソース走査で検証
// 最適化・LLMパースはサーバ直叩きせず、与えられたデータのみで動く（純粋・決定論）ことを担保する。
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

const s3Files = [
  'shift/shiftTimes.ts',
  'shift/model.ts',
  'shift/assignment.ts',
  'shift/constraints.ts',
  'shift/optimize.ts',
  'shift/finalize.ts',
  'shift/llm.ts',
]

// UI/DB/グローバル/外部I/O/機密 の禁止パターン
const forbidden = [
  { label: 'react', re: /from\s+['"]react['"]|require\(\s*['"]react['"]\s*\)/ },
  { label: 'react-native', re: /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]\s*\)/ },
  { label: '@supabase', re: /from\s+['"]@supabase[^'"]*['"]|require\(\s*['"]@supabase[^'"]*['"]\s*\)/ },
  { label: 'window', re: /\bwindow\b/ },
  { label: 'document', re: /\bdocument\b/ },
  { label: 'fetch', re: /\bfetch\s*\(/ },
  { label: 'axios', re: /\baxios\b/ },
  { label: 'process.env', re: /process\.env/ },
  { label: 'anthropic', re: /anthropic/i },
  { label: 'apiKey', re: /api[_-]?key/i },
]

// 非決定性の禁止（日付は 'YYYY-MM-DD' 文字列で扱う）
const forbiddenNondeterminism = [
  { label: 'Date.now', re: /Date\.now\s*\(/ },
  { label: 'Math.random', re: /Math\.random\s*\(/ },
  { label: 'new Date()（引数なし）', re: /new\s+Date\s*\(\s*\)/ },
]

describe('Sprint3 純粋性・秘匿境界 [REQ-016..021]', () => {
  it('s3purity_全shiftソースが走査できる', () => {
    // Arrange & Act
    const codes = s3Files.map((f) => readSrc(f))
    // Assert
    expect(codes.every((c) => c.length > 0)).toBe(true)
  })

  it('s3purity_shiftソース_UI/DB/外部I/O/機密を参照しない', () => {
    // Arrange & Act & Assert
    for (const f of s3Files) {
      const code = readSrc(f)
      for (const rule of forbidden) {
        expect(rule.re.test(code), `${f} が ${rule.label} を参照している`).toBe(false)
      }
    }
  })

  it('s3purity_shiftソース_非決定的APIを参照しない', () => {
    // Arrange & Act & Assert
    for (const f of s3Files) {
      const code = readSrc(f)
      for (const rule of forbiddenNondeterminism) {
        expect(rule.re.test(code), `${f} が ${rule.label} を参照している`).toBe(false)
      }
    }
  })
})
