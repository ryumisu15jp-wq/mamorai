// [REQ-014] 秘匿境界の静的確認 + Sprint2新規ソースの純粋性をソース走査で検証
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

// Sprint2 で新規追加した純粋関数モジュール
const s2Files = [
  'report/workflow.ts',
  'report/search.ts',
  'report/aggregate.ts',
  'report/exportTable.ts',
  'risk/view.ts',
]

// UI/DB/グローバル依存の禁止パターン（既存 purity.test.ts と同方針・別ファイル）
const forbiddenPurity = [
  { label: 'react', re: /from\s+['"]react['"]|require\(\s*['"]react['"]\s*\)/ },
  { label: 'react-native', re: /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]\s*\)/ },
  { label: '@supabase', re: /from\s+['"]@supabase[^'"]*['"]|require\(\s*['"]@supabase[^'"]*['"]\s*\)/ },
  { label: 'window', re: /\bwindow\b/ },
  { label: 'document', re: /\bdocument\b/ },
]

// [REQ-014] リスクビューは予測エンジンを直叩きしない = 秘匿境界。外部I/O・機密参照の禁止
const forbiddenSecrecy = [
  { label: 'Claude', re: /\bClaude\b/i },
  { label: 'anthropic', re: /anthropic/i },
  { label: 'apiKey', re: /api[_-]?key/i },
  { label: 'fetch', re: /\bfetch\s*\(/ },
  { label: 'axios', re: /\baxios\b/ },
  { label: 'process.env', re: /process\.env/ },
]

describe('Sprint2 純粋性 [REQ-008..015]', () => {
  it('s2purity_新規ソースが全て走査できる', () => {
    // Arrange & Act
    const codes = s2Files.map((f) => readSrc(f))
    // Assert
    expect(codes.every((c) => c.length > 0)).toBe(true)
  })

  it('s2purity_新規ソース_react_reactnative_supabase_window_documentを参照しない', () => {
    // Arrange & Act & Assert
    for (const f of s2Files) {
      const code = readSrc(f)
      for (const rule of forbiddenPurity) {
        expect(rule.re.test(code), `${f} が ${rule.label} を参照している`).toBe(false)
      }
    }
  })
})

describe('リスクビュー秘匿境界の静的確認 [REQ-014]', () => {
  it('s2secrecy_risk_view_予測エンジン直叩き禁止_機密と外部I/Oを参照しない', () => {
    // Arrange
    const code = readSrc('risk/view.ts')
    // Act & Assert
    for (const rule of forbiddenSecrecy) {
      expect(rule.re.test(code), `risk/view.ts が ${rule.label} を参照している`).toBe(false)
    }
  })
})
