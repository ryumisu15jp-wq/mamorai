// [REQ-001] 純粋性: src/report/*.ts と types.ts が UI/DB/グローバルへ依存しないことをソース走査で検証
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const reportDir = resolve(here, '../report')
const typesFile = resolve(here, '../types.ts')

function sourceFiles(): { path: string; code: string }[] {
  const files: { path: string; code: string }[] = []
  for (const name of readdirSync(reportDir)) {
    if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.spec.ts')) {
      files.push({ path: `report/${name}`, code: readFileSync(resolve(reportDir, name), 'utf8') })
    }
  }
  files.push({ path: 'types.ts', code: readFileSync(typesFile, 'utf8') })
  return files
}

/** import/require の禁止モジュール */
const forbiddenImports = [
  { label: 'react', re: /from\s+['"]react['"]|require\(\s*['"]react['"]\s*\)/ },
  { label: 'react-native', re: /from\s+['"]react-native['"]|require\(\s*['"]react-native['"]\s*\)/ },
  { label: '@supabase', re: /from\s+['"]@supabase[^'"]*['"]|require\(\s*['"]@supabase[^'"]*['"]\s*\)/ },
]
/** グローバルオブジェクトへの参照禁止 */
const forbiddenGlobals = [
  { label: 'window', re: /\bwindow\b/ },
  { label: 'document', re: /\bdocument\b/ },
]

describe('input-core purity [REQ-001]', () => {
  it('purity_対象ソースが最低1件_走査できる', () => {
    // Arrange & Act
    const files = sourceFiles()
    // Assert
    expect(files.length).toBeGreaterThan(0)
  })

  it('purity_report配下とtypes_react_reactnative_supabaseをimportしない', () => {
    // Arrange
    const files = sourceFiles()
    // Act & Assert
    for (const f of files) {
      for (const rule of forbiddenImports) {
        expect(rule.re.test(f.code), `${f.path} が ${rule.label} を import している`).toBe(false)
      }
    }
  })

  it('purity_report配下とtypes_window_documentを参照しない', () => {
    // Arrange
    const files = sourceFiles()
    // Act & Assert
    for (const f of files) {
      for (const rule of forbiddenGlobals) {
        expect(rule.re.test(f.code), `${f.path} が ${rule.label} を参照している`).toBe(false)
      }
    }
  })
})
