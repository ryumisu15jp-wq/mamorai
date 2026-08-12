// [S6-う] 出力センター: 出力定義エンジンで 配置予定表/配置表/月次報告書 を生成・プレビュー。
// レイアウト/セル対応は「データ定義」(defaultOutputDefs)側にあり、UIはレンダリング専用（層分離厳守）:
//   - renderOutputDoc(def, data): PDF用の解決済みドキュメント（見出し/メタ/表）
//   - resolveCellWrites(def, data): 既存Excelへの書き戻しプラン（互換モード）
import { useMemo, useState } from 'react'
import {
  defaultOutputDefs,
  renderOutputDoc,
  resolveCellWrites,
  type OutputDef,
  type CellMappingDef,
} from '@mamorai/input-core'

const SITE_ID = 'site-bht'

// 出力エンジンへ渡すデモ用ソースデータ（本結線時は日報/シフト集計から生成）。
const SOURCE = {
  meta: { siteName: 'ららテラス', period: '2026-08', issuedAt: '2026-08-12' },
  plans: [
    { date: '2026-08-01', position: '日勤', headcount: 2, workType: '日勤' },
    { date: '2026-08-01', position: '夜勤', headcount: 1, workType: '夜勤' },
    { date: '2026-08-02', position: '日勤', headcount: 2, workType: '日勤' },
    { date: '2026-08-02', position: '夜勤', headcount: 1, workType: '夜勤' },
  ],
  assignments: [
    { position: '責任者', staffName: '三角 龍彦', workType: '日勤' },
    { position: '日勤A', staffName: '佐藤 健', workType: '日勤' },
    { position: '日勤B', staffName: '鈴木 花', workType: '日勤' },
    { position: '夜勤A', staffName: null, workType: '夜勤' }, // 欠員
  ],
  tally: [
    { type: '未施錠', count: 5 },
    { type: '不審者/迷惑行為', count: 2 },
    { type: '転倒/怪我', count: 1 },
  ],
  summaryRows: [
    { label: '報告日数', value: 31 },
    { label: '対応件数合計', value: 8 },
    { label: 'インシデント件数', value: 3 },
    { label: '承認率', value: '96%' },
  ],
}

// Excel書き戻し（互換）の例: 既存ブックの入力セル ↔ データ項目。
const EXCEL_MAPPINGS: CellMappingDef[] = [
  { cell: 'AQ14', sourcePath: 'tally.0.count' }, // 未施錠 → 原本の入力セル
  { cell: 'AQ37', sourcePath: 'tally.1.count' }, // 不審者/迷惑行為
  { cell: 'L43', sourcePath: 'summaryRows.1.value' }, // 対応件数合計
]

export function OutputCenter(): JSX.Element {
  const defs = useMemo(() => defaultOutputDefs(SITE_ID), [])
  const [idx, setIdx] = useState(0)
  const def: OutputDef = defs[idx] ?? defs[0]!
  const [toast, setToast] = useState<string | null>(null)

  const doc = useMemo(() => renderOutputDoc(def, SOURCE), [def])

  // 月次報告書のときだけ Excel書き戻しプランも見せる（互換モードの実演）。
  const excelDef: OutputDef = useMemo(
    () => ({ id: 'xl', target: '月次報告書', format: 'excel', siteId: SITE_ID, sheet: '原本', templateBook: 'bht_nippou.xlsm', mappings: EXCEL_MAPPINGS }),
    [],
  )
  const cellWrites = useMemo(() => resolveCellWrites(excelDef, SOURCE), [excelDef])
  const showExcel = def.target === '月次報告書'

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">出力センター</h1>
        <span className="muted">1つの入力 → 現場様式で出力（定義データ駆動）</span>
      </header>

      <div className="seg" role="tablist" aria-label="成果物の選択">
        {defs.map((d, i) => (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={`seg-btn${i === idx ? ' seg-on' : ''}`}
            onClick={() => setIdx(i)}
          >
            {d.target}
          </button>
        ))}
      </div>

      <div className="row-actions" role="group" aria-label="出力操作">
        <button type="button" className="btn btn-primary" onClick={() => setToast(`${def.target}: 現場フォーマットPDFを生成（本結線時）`)}>PDFで出力</button>
        {showExcel && (
          <button type="button" className="btn btn-secondary" onClick={() => setToast('既存Excel(原本)へ書き戻し（本結線時・下記プランに従う）')}>既存Excelへ書き戻し</button>
        )}
      </div>

      {/* 解決済みドキュメント（PDFプレビュー相当） */}
      <section className="card doc-preview" aria-label={`${doc.title} プレビュー`}>
        <div className="card-b">
          <h2 className="doc-title">{doc.title}</h2>
          {doc.blocks.map((b, i) => {
            if (b.kind === 'title') return null
            if (b.kind === 'meta') {
              return (
                <table key={i} className="doc-meta">
                  <tbody>
                    {(b.rows ?? []).map((r, j) => (
                      <tr key={j}><th>{r[0]}</th><td>{r[1]}</td></tr>
                    ))}
                  </tbody>
                </table>
              )
            }
            return (
              <div key={i} className="doc-block">
                {b.text && <h3 className="doc-caption">{b.text}</h3>}
                <table className="tbl">
                  <thead><tr>{(b.headers ?? []).map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(b.rows ?? []).map((r, ri) => (
                      <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c === '' ? <span className="muted">—</span> : c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </section>

      {/* Excel書き戻しプラン（互換モードの中身をデータで可視化） */}
      {showExcel && (
        <section className="card" aria-label="Excel書き戻しプラン">
          <div className="card-h"><h2>Excel書き戻しプラン（互換モード）</h2><span className="muted">{excelDef.templateBook} / シート「{excelDef.sheet}」</span></div>
          <div className="card-b">
            <p className="muted">既存ブックの入力セルへ、値だけを差し込みます（集計式・体裁は保持）。</p>
            <table className="tbl">
              <thead><tr><th>シート</th><th>セル</th><th>書込値</th></tr></thead>
              <tbody>
                {cellWrites.map((w) => (
                  <tr key={w.cell}><td>{w.sheet}</td><td><code>{w.cell}</code></td><td>{String(w.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {toast !== null && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
