// [S6-う] 出力定義エンジン（純粋・UI/DB非依存）
// 「1つの構造化入力 → N個の現場フォーマット出力」を、コード改修なしのデータ定義で実現する。
//   - PDF: レイアウト(見出し/メタ/表)を OutputBlockDef の配列で定義 → renderOutputDoc で解決
//   - Excel書き戻し: 既存ブックの「入力セル ↔ データ項目」対応を CellMappingDef で定義 → resolveCellWrites で書込プラン化
// 新現場・新様式は「定義データ」を足すだけ（配置予定表/配置表/月次報告書 を同一エンジンで生成）。

export type OutputTarget = '配置予定表' | '配置表' | '月次報告書' | (string & {})
export type OutputFormat = 'pdf' | 'excel'

/** メタ情報1項目（ラベル ← データのドットパス） */
export interface MetaFieldDef {
  label: string
  path: string
}

/** PDFレイアウトの1ブロック（title/meta/table） */
export interface OutputBlockDef {
  kind: 'title' | 'meta' | 'table'
  /** title のテキスト、または table のキャプション */
  text?: string
  /** kind==='meta' の項目群 */
  fields?: MetaFieldDef[]
  /** kind==='table' の列見出し */
  headers?: string[]
  /** kind==='table' の行データ配列へのドットパス */
  rowsPath?: string
  /** kind==='table' の各行アイテムから取り出すキー群（headers と同順） */
  columns?: string[]
}

/** Excel書き戻しの1セル対応（cell ← データのドットパス） */
export interface CellMappingDef {
  cell: string
  sourcePath: string
}

/** 出力定義（現場×様式ごとに1レコード・データ駆動） */
export interface OutputDef {
  id: string
  target: OutputTarget
  format: OutputFormat
  siteId: string
  /** format==='pdf' のレイアウト */
  blocks?: OutputBlockDef[]
  /** format==='excel' の対象シート名 */
  sheet?: string
  /** format==='excel' のひな型ブック名/パス */
  templateBook?: string
  /** format==='excel' のセル対応表 */
  mappings?: CellMappingDef[]
}

/** Excelへの1セル書込プラン */
export interface CellWrite {
  sheet: string
  cell: string
  value: string | number | boolean
}

/** 解決済みの描画ブロック */
export interface RenderedBlock {
  kind: 'title' | 'meta' | 'table'
  text?: string
  headers?: string[]
  rows?: (string | number)[][]
}

/** 解決済み出力ドキュメント（PDFレンダラ/プレビューが消費する中間表現） */
export interface RenderedDoc {
  target: OutputTarget
  title: string
  blocks: RenderedBlock[]
}

/**
 * [S6-う] ドットパス（'a.b.c' / 配列は 'rows.1.n'）で値を取り出す。存在しなければ undefined。
 * 純粋・副作用なし。prototype 汚染を避けるため独自キーのみ辿る。
 */
export function getByPath(obj: unknown, path: string): unknown {
  const segments = path.split('.')
  let cur: unknown = obj
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** 描画用にスカラー化（null/undefined → 空文字。集計式や体裁を壊さないため）。 */
function toCell(v: unknown): string | number {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? '有' : '無'
  return String(v)
}

/**
 * [S6-う](a) Excel書き戻し: 出力定義の mappings をソースデータで解決し、セル書込プランを返す。
 * 欠損ソースは空文字（既存の集計式・体裁を壊さない）。format!=='excel' は空配列。
 */
export function resolveCellWrites(def: OutputDef, data: unknown): CellWrite[] {
  if (def.format !== 'excel') return []
  const sheet = def.sheet ?? ''
  return (def.mappings ?? []).map((m) => {
    const raw = getByPath(data, m.sourcePath)
    return { sheet, cell: m.cell, value: raw === undefined || raw === null ? '' : toCell(raw) }
  })
}

/**
 * [S6-う](b) PDF自動出力: 出力定義の blocks をソースデータで解決し RenderedDoc を返す。
 * title ブロックが無ければ target をタイトルにする。欠員/欠損は空文字。
 */
export function renderOutputDoc(def: OutputDef, data: unknown): RenderedDoc {
  let title = def.target
  const blocks: RenderedBlock[] = []
  for (const b of def.blocks ?? []) {
    if (b.kind === 'title') {
      if (b.text !== undefined) title = b.text
      blocks.push({ kind: 'title', text: b.text ?? def.target })
    } else if (b.kind === 'meta') {
      const rows = (b.fields ?? []).map((f) => [f.label, toCell(getByPath(data, f.path))])
      blocks.push({ kind: 'meta', text: b.text, rows })
    } else {
      const arr = getByPath(data, b.rowsPath ?? '')
      const items = Array.isArray(arr) ? arr : []
      const cols = b.columns ?? []
      const rows = items.map((item) => cols.map((c) => toCell(getByPath(item, c))))
      blocks.push({ kind: 'table', text: b.text, headers: b.headers ?? [], rows })
    }
  }
  return { target: def.target, title, blocks }
}

/**
 * [S6-う] 3成果物（配置予定表/配置表/月次報告書）の既定PDF出力定義プリセット。
 * 現場は defaultOutputDefs をコピーしてブロック/マッピングを調整するだけで自社様式化できる。
 */
export function defaultOutputDefs(siteId: string): OutputDef[] {
  const metaCommon: MetaFieldDef[] = [
    { label: '現場', path: 'meta.siteName' },
    { label: '対象', path: 'meta.period' },
    { label: '作成日', path: 'meta.issuedAt' },
  ]
  return [
    {
      id: `out-plan-${siteId}`, target: '配置予定表', format: 'pdf', siteId,
      blocks: [
        { kind: 'title', text: '配置予定表' },
        { kind: 'meta', fields: metaCommon },
        {
          kind: 'table', text: '予定', headers: ['日付', 'ポジション', '予定人員', '勤務区分'],
          rowsPath: 'plans', columns: ['date', 'position', 'headcount', 'workType'],
        },
      ],
    },
    {
      id: `out-assign-${siteId}`, target: '配置表', format: 'pdf', siteId,
      blocks: [
        { kind: 'title', text: '配置表' },
        { kind: 'meta', fields: metaCommon },
        {
          kind: 'table', text: '当日配置', headers: ['ポジション', '担当者', '勤務区分'],
          rowsPath: 'assignments', columns: ['position', 'staffName', 'workType'],
        },
      ],
    },
    {
      id: `out-month-${siteId}`, target: '月次報告書', format: 'pdf', siteId,
      blocks: [
        { kind: 'title', text: '月次報告書' },
        { kind: 'meta', fields: metaCommon },
        {
          kind: 'table', text: 'データ項目 × 件数', headers: ['データ項目', '件数'],
          rowsPath: 'tally', columns: ['type', 'count'],
        },
        {
          kind: 'table', text: 'サマリー', headers: ['項目', '値'],
          rowsPath: 'summaryRows', columns: ['label', 'value'],
        },
      ],
    },
  ]
}
