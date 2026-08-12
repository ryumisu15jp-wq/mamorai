import { describe, it, expect } from 'vitest'
import {
  getByPath,
  resolveCellWrites,
  renderOutputDoc,
  defaultOutputDefs,
  type OutputDef,
} from '../index.js'

describe('[S6-う] getByPath ドットパス解決', () => {
  it('ネストしたオブジェクト値を取得', () => {
    expect(getByPath({ a: { b: { c: 5 } } }, 'a.b.c')).toBe(5)
  })
  it('配列インデックスを解決', () => {
    expect(getByPath({ rows: [{ n: 1 }, { n: 2 }] }, 'rows.1.n')).toBe(2)
  })
  it('存在しないパスは undefined', () => {
    expect(getByPath({ a: 1 }, 'a.b.c')).toBeUndefined()
  })
})

describe('[S6-う] resolveCellWrites（Excel書き戻しをデータ化）', () => {
  const def: OutputDef = {
    id: 'o1', target: '月次報告書', format: 'excel', siteId: 's',
    sheet: '原本', templateBook: 'bht.xlsm',
    mappings: [
      { cell: 'AQ14', sourcePath: 'counts.未施錠' },
      { cell: 'AQ37', sourcePath: 'counts.BAR汚損' },
    ],
  }
  it('ソースデータからセル書込プランを生成', () => {
    const writes = resolveCellWrites(def, { counts: { 未施錠: 5, 'BAR汚損': 2 } })
    expect(writes).toEqual([
      { sheet: '原本', cell: 'AQ14', value: 5 },
      { sheet: '原本', cell: 'AQ37', value: 2 },
    ])
  })
  it('欠損ソースは空文字（集計式を壊さない）', () => {
    const writes = resolveCellWrites(def, { counts: { 未施錠: 5 } })
    expect(writes.find((w) => w.cell === 'AQ37')?.value).toBe('')
  })
})

describe('[S6-う] renderOutputDoc（PDFレイアウトをデータ化）', () => {
  const def: OutputDef = {
    id: 'o2', target: '配置表', format: 'pdf', siteId: 's',
    blocks: [
      { kind: 'title', text: '配置表' },
      { kind: 'meta', fields: [{ label: '現場', path: 'meta.siteName' }, { label: '日付', path: 'meta.date' }] },
      { kind: 'table', text: '配置', headers: ['ポジション', '担当'], rowsPath: 'assignments', columns: ['position', 'staffName'] },
    ],
  }
  it('データを流し込み解決済みドキュメントを返す', () => {
    const doc = renderOutputDoc(def, {
      meta: { siteName: 'ららテラス', date: '2026-08-01' },
      assignments: [{ position: '責任者', staffName: '三角' }, { position: '日勤A', staffName: '四角' }],
    })
    expect(doc.title).toBe('配置表')
    const metaBlock = doc.blocks.find((b) => b.kind === 'meta')
    expect(metaBlock?.rows).toContainEqual(['現場', 'ららテラス'])
    const tableBlock = doc.blocks.find((b) => b.kind === 'table')
    expect(tableBlock?.headers).toEqual(['ポジション', '担当'])
    expect(tableBlock?.rows).toEqual([['責任者', '三角'], ['日勤A', '四角']])
  })
  it('タイトルブロックが無ければ target をタイトルにする', () => {
    const doc = renderOutputDoc({ id: 'x', target: '配置予定表', format: 'pdf', siteId: 's', blocks: [] }, {})
    expect(doc.title).toBe('配置予定表')
  })
  it('欠員(null担当)は空文字で描画', () => {
    const doc = renderOutputDoc(def, { meta: {}, assignments: [{ position: '夜勤A', staffName: null }] })
    const tableBlock = doc.blocks.find((b) => b.kind === 'table')
    expect(tableBlock?.rows).toEqual([['夜勤A', '']])
  })
})

describe('[S6-う] defaultOutputDefs 3成果物プリセット', () => {
  it('配置予定表/配置表/月次報告書 のPDF定義を返す', () => {
    const defs = defaultOutputDefs('siteA')
    const targets = defs.map((d) => d.target)
    for (const t of ['配置予定表', '配置表', '月次報告書']) expect(targets).toContain(t)
    for (const d of defs) {
      expect(d.siteId).toBe('siteA')
      expect(d.format).toBe('pdf')
      expect((d.blocks ?? []).length).toBeGreaterThan(0)
    }
  })
})
